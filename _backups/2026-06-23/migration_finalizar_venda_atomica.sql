-- ============================================================
-- P5: Função atômica finalizar_venda — TecnoCell
-- Gerado em 2026-06-23
--
-- RODAR NO: Supabase Dashboard > SQL Editor > New query > Run
-- PREREQUISITO: tabela pagamentos_venda já criada
-- ============================================================

create or replace function finalizar_venda(
  p_itens        jsonb,
  p_pagamentos   jsonb,
  p_pessoa_id    text,
  p_desconto     numeric,
  p_observacoes  text,
  p_deposito_id  text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_subtotal           numeric := 0;
  v_total_produtos     numeric;
  v_total_taxas        numeric := 0;
  v_total              numeric;
  v_forma_pag_id       text;
  v_venda_id           uuid;
  v_item               jsonb;
  v_pag                jsonb;
  v_estoque_id         uuid;
  v_qtd_disponivel     numeric;
  v_nova_qtd           numeric;
  v_pago_total         numeric := 0;
  v_fiado_total        numeric := 0;
  v_pessoa_nome        text;
  v_today              date;
  v_now                timestamptz;
  v_estoque_atualizado jsonb := '{}'::jsonb;
begin
  v_today := current_date;
  v_now   := now();

  -- Calcular totais
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_subtotal := v_subtotal
      + (v_item->>'quantidade')::numeric
      * (v_item->>'preco_unitario')::numeric;
  end loop;

  v_total_produtos := greatest(0, v_subtotal - p_desconto);

  for v_pag in select * from jsonb_array_elements(p_pagamentos) loop
    v_total_taxas := v_total_taxas + (v_pag->>'taxa')::numeric;
  end loop;

  v_total := v_total_produtos + v_total_taxas;

  -- Forma única ou null (misto)
  if jsonb_array_length(p_pagamentos) = 1 then
    v_forma_pag_id := p_pagamentos->0->>'forma_pagamento_id';
  end if;

  -- Validar e debitar estoque (lock para evitar race condition)
  for v_item in select * from jsonb_array_elements(p_itens) loop
    select id, quantidade
    into   v_estoque_id, v_qtd_disponivel
    from   estoque
    where  deposito_id = p_deposito_id::uuid
      and  produto_id  = (v_item->>'produto_id')::uuid
    for update;

    if not found then
      raise exception 'Produto "%" não encontrado no estoque do depósito',
        v_item->>'nome';
    end if;

    if v_qtd_disponivel < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente para "%" (disponível: %)',
        v_item->>'nome', v_qtd_disponivel;
    end if;

    v_nova_qtd := v_qtd_disponivel - (v_item->>'quantidade')::numeric;

    update estoque
    set    quantidade = v_nova_qtd, updated_at = v_now
    where  id = v_estoque_id;

    v_estoque_atualizado := v_estoque_atualizado
      || jsonb_build_object(v_item->>'produto_id', v_nova_qtd);
  end loop;

  -- Inserir venda
  insert into vendas (total, desconto, forma_pagamento_id, pessoa_id, observacoes, status)
  values (
    v_total,
    p_desconto,
    v_forma_pag_id,
    case when p_pessoa_id is not null then p_pessoa_id::uuid end,
    nullif(p_observacoes, ''),
    'concluida'
  )
  returning id into v_venda_id;

  -- Inserir itens
  insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario, desconto_item, total_item)
  select
    v_venda_id,
    (item->>'produto_id')::uuid,
    (item->>'quantidade')::numeric,
    (item->>'preco_unitario')::numeric,
    0,
    (item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  -- Inserir pagamentos
  insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
  select
    v_venda_id,
    pag->>'forma_pagamento_id',
    (pag->>'valor')::numeric,
    (pag->>'taxa')::numeric,
    nullif(pag->>'maquina', ''),
    (pag->>'parcelas')::int,
    pag->>'status'
  from jsonb_array_elements(p_pagamentos) as pag;

  -- Calcular pago vs fiado
  select
    coalesce(sum(case when pag->>'status' = 'pago'
      then (pag->>'valor')::numeric + (pag->>'taxa')::numeric else 0 end), 0),
    coalesce(sum(case when pag->>'status' = 'pendente'
      then (pag->>'valor')::numeric else 0 end), 0)
  into v_pago_total, v_fiado_total
  from jsonb_array_elements(p_pagamentos) as pag;

  -- Lançamento pago
  if v_pago_total > 0 then
    insert into lancamentos
      (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, updated_at)
    values (
      'Venda #' || left(v_venda_id::text, 8),
      v_pago_total, 'receber',
      v_today, v_today, 'pago', v_today, v_now
    );
  end if;

  -- Lançamento fiado
  if v_fiado_total > 0 then
    if p_pessoa_id is not null then
      select nome into v_pessoa_nome from pessoas where id = p_pessoa_id::uuid;
    end if;
    insert into lancamentos
      (descricao, valor, tipo, data_competencia, data_vencimento, status, pessoa_nome, updated_at)
    values (
      'A Receber — Fiado #' || left(v_venda_id::text, 8),
      v_fiado_total, 'receber',
      v_today, v_today, 'pendente', v_pessoa_nome, v_now
    );
  end if;

  return jsonb_build_object(
    'venda_id',           v_venda_id,
    'total',              v_total,
    'estoque_atualizado', v_estoque_atualizado
  );
end;
$$;
