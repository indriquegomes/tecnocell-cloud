-- ============================================================
-- HOTFIX (conselho, bug #1): devolução de aparelho serializado.
--
-- Antes: registrar_devolucao incrementava estoque mas NÃO tocava em numeros_serie.
-- Devolver um aparelho vendido inflava o estoque e deixava o IMEI preso em
-- 'vendido' — o aparelho sumia do estoque real e não podia ser revendido.
--
-- Agora: recebe p_series (os IMEIs devolvidos, com status_produto). Para cada:
--   - volta numeros_serie para 'em_estoque' (ou 'defeito'), limpa venda_id e
--     grava o depósito de retorno;
--   - o estoque sobe 1 só para aparelho reaproveitável (não-defeito).
-- Itens NÃO serializados seguem incrementando o estoque em bloco (como antes).
-- Sem dupla contagem: item que tem série não entra no incremento em bloco.
--
-- Brinde: cancelamento de fiado agora filtra tipo='receber' (não cancela outros
-- lançamentos pendentes vinculados à venda).
--
-- Idempotente. Seguro reaplicar.
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
  v_devolucao_id uuid := gen_random_uuid();
  v_valor_total  numeric := 0;
  v_item         jsonb;
  v_s            jsonb;
  v_deposito     text;
  v_estoque_id   uuid;
  v_defeito      boolean;
  v_today        date := current_date;
  v_now          timestamptz := now();
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

  -- retorno ao estoque — itens NÃO serializados (em bloco, como antes)
  for v_item in select * from jsonb_array_elements(p_itens) loop
    -- produto com série nesta devolução é tratado por unidade abaixo
    if exists (select 1 from jsonb_array_elements(p_series) s where s->>'produto_id' = v_item->>'produto_id') then
      continue;
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

  -- aparelhos serializados devolvidos — volta o IMEI e ajusta estoque por unidade
  for v_s in select * from jsonb_array_elements(p_series) loop
    v_defeito := (v_s->>'status_produto') = 'defeito';

    update numeros_serie
      set status     = case when v_defeito then 'defeito' else 'em_estoque' end,
          venda_id   = null,
          deposito_id = v_deposito,
          updated_at = v_now
    where produto_id = (v_s->>'produto_id') and serie = (v_s->>'serie')
      and venda_id = p_venda_id::text and status = 'vendido';
    if not found then
      raise exception 'IMEI % não consta como vendido nesta venda', v_s->>'serie';
    end if;

    if not v_defeito then
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

  -- tratamento financeiro
  if p_lancamento_pendente then
    update lancamentos set status = 'cancelado', updated_at = v_now
    where venda_id = p_venda_id and status = 'pendente' and tipo = 'receber';
  elsif p_tipo_credito = 'credito_conta' then
    if p_pessoa_id is not null then
      insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id)
      values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_valor_total, 'credito', 'Devolução de compra', v_devolucao_id);
    end if;
  elsif p_tipo_credito <> 'sem_reembolso' then
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, updated_at)
    values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_valor_total, 'pagar', v_today, v_today, 'pago', v_today, p_tipo_credito, p_pessoa_nome, v_now);
  end if;

  return jsonb_build_object('devolucao_id', v_devolucao_id);
end;
$function$;
