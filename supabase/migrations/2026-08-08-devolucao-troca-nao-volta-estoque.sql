-- ============================================================
-- Devolução: só peça "OK" volta ao estoque vendável (pedido Isa/Vitor).
--
-- Antes: item NÃO serializado voltava SEMPRE ao estoque, mesmo marcado
-- Defeito/Troca/Avaria. Peça ruim (que vai pro fornecedor / "caixinha")
-- entrava como vendável — errado.
--
-- Agora: retorna ao estoque vendável só quando status_produto = 'ok'.
--   Troca / Defeito / Avaria → NÃO volta (dá saída do sistema; a venda
--   já foi cancelada/abatida no bloco financeiro).
--   Serializado: 'ok' volta 'em_estoque' e +1; os demais viram 'defeito'
--   e não incrementam (mantém o comportamento serializado, agora p/ troca/avaria também).
--
-- Mantém o bloco financeiro parcial (migration 2026-08-07). Idempotente.
-- ============================================================

create or replace function public.registrar_devolucao(
  p_venda_id            uuid,
  p_deposito_id         text,
  p_pessoa_id           text,
  p_pessoa_nome         text,
  p_vendedor_nome       text,
  p_motivo              text,
  p_tipo_credito        text,
  p_itens               jsonb,
  p_lancamento_pendente boolean,
  p_series              jsonb default '[]'::jsonb
) returns jsonb
 language plpgsql
 security definer
as $function$
declare
  v_devolucao_id   uuid := gen_random_uuid();
  v_valor_total    numeric := 0;
  v_item           jsonb;
  v_s              jsonb;
  v_deposito       text;
  v_estoque_id     uuid;
  v_reaproveitavel boolean;
  v_today          date := current_date;
  v_now            timestamptz := now();
  v_fiado_lanc_id  text;
  v_fiado_restante numeric;
  v_abate_fiado    numeric := 0;
  v_reembolso      numeric := 0;
begin
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_valor_total := v_valor_total + (v_item->>'total_item')::numeric;
  end loop;

  v_deposito := p_deposito_id;
  if v_deposito is null then
    select id into v_deposito from depositos order by nome limit 1;
  end if;
  if v_deposito is null then
    raise exception 'Nenhum depósito cadastrado para retornar o estoque.';
  end if;

  insert into devolucoes (id, venda_id, deposito_id, pessoa_nome, vendedor_nome, motivo, valor_total, tipo_credito, status)
  values (v_devolucao_id, p_venda_id, v_deposito, coalesce(p_pessoa_nome, 'Cliente Final'),
          p_vendedor_nome, nullif(p_motivo, ''), v_valor_total, p_tipo_credito, 'concluida');

  insert into itens_devolucao (devolucao_id, produto_id, nome, quantidade, preco_unitario, total_item, status_produto)
  select v_devolucao_id, item->>'produto_id', item->>'nome', (item->>'quantidade')::numeric,
         (item->>'preco_unitario')::numeric, (item->>'total_item')::numeric, coalesce(item->>'status_produto', 'ok')
  from jsonb_array_elements(p_itens) as item;

  -- retorno ao estoque — itens NÃO serializados. Só 'ok' volta ao vendável.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    if exists (select 1 from jsonb_array_elements(p_series) s where s->>'produto_id' = v_item->>'produto_id') then
      continue;
    end if;
    if coalesce(v_item->>'status_produto', 'ok') <> 'ok' then
      continue;  -- Troca/Defeito/Avaria → não volta pro estoque (sai pro fornecedor)
    end if;
    select id into v_estoque_id from estoque
    where produto_id = (v_item->>'produto_id') and deposito_id = v_deposito
    for update;
    if found then
      update estoque set quantidade = quantidade + (v_item->>'quantidade')::numeric, updated_at = v_now where id = v_estoque_id;
    else
      insert into estoque (produto_id, deposito_id, quantidade)
      values (v_item->>'produto_id', v_deposito, (v_item->>'quantidade')::numeric);
    end if;
  end loop;

  -- aparelhos serializados devolvidos — só 'ok' volta 'em_estoque' e +1
  for v_s in select * from jsonb_array_elements(p_series) loop
    v_reaproveitavel := (coalesce(v_s->>'status_produto', 'ok') = 'ok');
    update numeros_serie
      set status     = case when v_reaproveitavel then 'em_estoque' else 'defeito' end,
          venda_id   = null,
          deposito_id = v_deposito,
          updated_at = v_now
    where produto_id = (v_s->>'produto_id') and serie = (v_s->>'serie')
      and venda_id = p_venda_id::text and status = 'vendido';
    if not found then
      raise exception 'IMEI % não consta como vendido nesta venda', v_s->>'serie';
    end if;
    if v_reaproveitavel then
      select id into v_estoque_id from estoque
      where produto_id = (v_s->>'produto_id') and deposito_id = v_deposito
      for update;
      if found then
        update estoque set quantidade = quantidade + 1, updated_at = v_now where id = v_estoque_id;
      else
        insert into estoque (produto_id, deposito_id, quantidade) values (v_s->>'produto_id', v_deposito, 1);
      end if;
    end if;
  end loop;

  -- ===== FINANCEIRO: abate a dívida primeiro, reembolsa o resto =====
  select id, (valor - coalesce(valor_pago, 0))
  into v_fiado_lanc_id, v_fiado_restante
  from lancamentos
  where venda_id = p_venda_id and status = 'pendente' and tipo = 'receber'
  order by created_at limit 1;

  v_fiado_restante := coalesce(v_fiado_restante, 0);
  v_abate_fiado    := least(v_valor_total, greatest(v_fiado_restante, 0));
  v_reembolso      := v_valor_total - v_abate_fiado;

  if v_abate_fiado > 0.005 and v_fiado_lanc_id is not null then
    if v_fiado_restante - v_abate_fiado <= 0.01 then
      update lancamentos set status = 'cancelado', updated_at = v_now where id = v_fiado_lanc_id;
    else
      update lancamentos set valor = round(valor - v_abate_fiado, 2), updated_at = v_now where id = v_fiado_lanc_id;
    end if;
  end if;

  if v_reembolso > 0.005 then
    if p_tipo_credito = 'credito_conta' then
      if p_pessoa_id is not null then
        insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id)
        values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'credito', 'Devolução de compra', v_devolucao_id);
      end if;
    elsif p_tipo_credito not in ('sem_reembolso', 'cancelamento_fiado') then
      insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, updated_at)
      values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'pagar', v_today, v_today, 'pago', v_today, p_tipo_credito, p_pessoa_nome, v_now);
    end if;
  end if;

  return jsonb_build_object('devolucao_id', v_devolucao_id, 'abate_fiado', v_abate_fiado, 'reembolso', v_reembolso);
end;
$function$;
