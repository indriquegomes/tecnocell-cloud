-- ============================================================
-- Devolução em DINHEIRO sai da GAVETA do caixa, não do Financeiro.
--
-- Vitor perguntou "de onde sai o dinheiro quando devolvo em dinheiro?". A resposta
-- era: de lugar nenhum do caixa — virava um lançamento no Financeiro ("a pagar" já
-- pago). Mas o dinheiro sai FÍSICO da gaveta, então o fechamento dava divergência
-- (a gaveta ficava com menos do que o sistema esperava).
--
-- Duas mudanças:
--
--   1. CHECK de movimentos_caixa.tipo: passa a aceitar 'devolucao'. A action
--      registra a saída de dinheiro como um movimento desse tipo no caixa aberto
--      da loja — e o fechamento já subtrai (o gancho totalDevolucoes existia mas
--      estava zerado).
--
--   2. registrar_devolucao: quando tipo_credito = 'dinheiro', NÃO cria mais o
--      lançamento financeiro. O dinheiro é evento de CAIXA (gaveta), não de
--      Financeiro. Débito / crédito / PIX CONTINUAM virando lançamento — esses
--      não saem da gaveta, saem pela conta/maquininha (estorno).
--
-- O resto do corpo é IDÊNTICO à migration 2026-07-15_devolucao_trava_excedente
-- (a trava de excedente é preservada). Idempotente, seguro reaplicar.
-- ============================================================

-- 1) tipo 'devolucao' permitido no caixa
alter table movimentos_caixa drop constraint if exists movimentos_caixa_tipo_check;
alter table movimentos_caixa add constraint movimentos_caixa_tipo_check
  check (tipo in ('reforco', 'retirada', 'recebimento', 'devolucao'));

-- 2) RPC: dinheiro não vira lançamento financeiro (vira movimento de caixa, na action)
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
  v_vendido        numeric;
  v_ja_devolvido   numeric;
begin
  -- ═══ TRAVA DE EXCEDENTE — antes de tocar em estoque/financeiro ═══
  perform 1 from vendas where id = p_venda_id for update;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if (v_item->>'quantidade')::numeric <= 0 then
      raise exception 'Quantidade de devolução inválida para "%": %',
        coalesce(v_item->>'nome', v_item->>'produto_id'), v_item->>'quantidade';
    end if;

    select coalesce(sum(quantidade), 0) into v_vendido
    from itens_venda
    where venda_id = p_venda_id and produto_id = (v_item->>'produto_id');

    select coalesce(sum(idv.quantidade), 0) into v_ja_devolvido
    from itens_devolucao idv
    join devolucoes d on d.id = idv.devolucao_id
    where d.venda_id = p_venda_id and idv.produto_id = (v_item->>'produto_id');

    if v_ja_devolvido + (v_item->>'quantidade')::numeric > v_vendido + 0.001 then
      raise exception 'Não dá para devolver % de "%": foram vendidas % e já devolvidas % (restam %).',
        (v_item->>'quantidade')::numeric,
        coalesce(v_item->>'nome', v_item->>'produto_id'),
        v_vendido, v_ja_devolvido, greatest(v_vendido - v_ja_devolvido, 0);
    end if;
  end loop;
  -- ═══ fim da trava ═══

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

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if exists (select 1 from jsonb_array_elements(p_series) s where s->>'produto_id' = v_item->>'produto_id') then
      continue;
    end if;
    if coalesce(v_item->>'status_produto', 'ok') <> 'ok' then
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
    -- 'dinheiro' NÃO entra aqui: sai da GAVETA (movimento de caixa, registrado na
    -- action), não é conta a pagar. Débito / crédito / PIX continuam virando
    -- lançamento — esses saem pela conta/maquininha, não pela gaveta.
    elsif p_tipo_credito not in ('sem_reembolso', 'cancelamento_fiado', 'dinheiro') then
      insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, updated_at)
      values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'pagar', v_today, v_today, 'pago', v_today, p_tipo_credito, p_pessoa_nome, v_now);
    end if;
  end if;

  return jsonb_build_object('devolucao_id', v_devolucao_id, 'abate_fiado', v_abate_fiado, 'reembolso', v_reembolso);
end;
$function$;
