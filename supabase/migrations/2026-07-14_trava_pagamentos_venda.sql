-- ============================================================
-- 🔴 TRAVA DE DINHEIRO em finalizar_venda: os pagamentos TÊM que fechar com a venda.
--
-- O buraco: o RPC gravava os pagamentos que o cliente mandasse, SEM conferir se eles
-- somavam o total. Um bug no PDV (ou um POST forjado, já que a action roda com service
-- role) fecharia uma venda de R$500 com R$5 de pagamento:
--   - o estoque seria baixado
--   - a venda ficaria 'concluida'
--   - os R$495 que faltaram NÃO viram fiado, não vão pro caixa, não aparecem em lugar
--     nenhum. Sumiço silencioso de dinheiro.
--
-- Agora: soma dos pagamentos (valor, sem a taxa) + crédito usado = total dos produtos
-- com desconto. Tolerância de 1 centavo (arredondamento). Também recusa pagamento com
-- valor negativo.
--
-- A trava roda ANTES de tocar em estoque/IMEI/venda: se a conta não bate, NADA é
-- escrito — o raise aborta a transação inteira.
--
-- A taxa da maquininha fica FORA da conta de propósito: é custo da loja, não dinheiro
-- que o cliente entregou (mesma lógica que já vale no recebimento de crediário).
--
-- Corpo byte-a-byte idêntico à 2026-07-13_fix_estorno_credito_sinal.sql, exceto:
--   + declaração de v_soma_pagamentos
--   + o bloco da trava (logo após v_total, antes do estoque)
-- ============================================================

create or replace function public.finalizar_venda(
  p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text,
  p_desconto numeric, p_observacoes text, p_deposito_id text,
  p_series jsonb default '[]'::jsonb,
  p_vendedor_id uuid default null,
  p_vendedor_nome text default null,
  p_credito_valor numeric default 0
) returns jsonb
 language plpgsql
 security definer
as $function$
declare
  v_subtotal           numeric := 0;
  v_total_produtos     numeric;
  v_total_taxas        numeric := 0;
  v_total              numeric;
  v_forma_pag_id       text;
  v_venda_id           uuid;
  v_venda_numero       integer;
  v_item               jsonb;
  v_pag                jsonb;
  v_estoque_id         uuid;
  v_qtd_disponivel     numeric;
  v_nova_qtd           numeric;
  v_pago_total         numeric := 0;
  v_fiado_total        numeric := 0;
  v_pessoa_nome        text;
  v_saldo_credito      numeric;
  v_today              date;
  v_now                timestamptz;
  v_estoque_atualizado jsonb := '{}'::jsonb;
  v_soma_pagamentos    numeric := 0;
begin
  v_today := current_date;
  v_now   := now();

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_subtotal := v_subtotal + (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric;
  end loop;

  v_total_produtos := greatest(0, v_subtotal - p_desconto);

  for v_pag in select * from jsonb_array_elements(p_pagamentos) loop
    v_total_taxas := v_total_taxas + (v_pag->>'taxa')::numeric;
  end loop;

  v_total := v_total_produtos + v_total_taxas;

  -- ═══ TRAVA DE DINHEIRO ═══
  -- O RPC confiava no cliente: gravava os pagamentos que viessem, sem conferir se
  -- fechavam com a venda. Um bug no PDV (ou um POST forjado) fecharia uma venda de
  -- R$500 com R$5 de pagamento — estoque baixado, venda 'concluida', e o dinheiro
  -- que faltou não vira fiado nem aparece em lugar nenhum. Sumiço silencioso.
  --
  -- Regra: soma dos pagamentos (valor, sem a taxa) + crédito usado = total dos
  -- produtos já com desconto. A taxa da maquininha é custo da loja, não pagamento
  -- do cliente — por isso fica de fora da conta.
  --
  -- Falha ANTES de mexer em estoque/IMEI: nada é escrito se a conta não bate.
  select coalesce(sum((pag->>'valor')::numeric), 0) into v_soma_pagamentos
  from jsonb_array_elements(p_pagamentos) as pag;

  if exists (select 1 from jsonb_array_elements(p_pagamentos) as pag
             where (pag->>'valor')::numeric < 0) then
    raise exception 'Pagamento com valor negativo não é permitido';
  end if;

  if abs((v_soma_pagamentos + coalesce(p_credito_valor, 0)) - v_total_produtos) > 0.01 then
    raise exception 'Os pagamentos não fecham com a venda: pagamentos R$ % + crédito R$ % = R$ %, mas a venda é R$ %',
      round(v_soma_pagamentos, 2),
      round(coalesce(p_credito_valor, 0), 2),
      round(v_soma_pagamentos + coalesce(p_credito_valor, 0), 2),
      round(v_total_produtos, 2);
  end if;

  if jsonb_array_length(p_pagamentos) = 1 then
    v_forma_pag_id := p_pagamentos->0->>'forma_pagamento_id';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select id, quantidade into v_estoque_id, v_qtd_disponivel
    from estoque
    where deposito_id = p_deposito_id and produto_id = (v_item->>'produto_id')
    for update;

    if not found then
      raise exception 'Produto "%" não encontrado no estoque do depósito', v_item->>'nome';
    end if;
    if v_qtd_disponivel < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente para "%" (disponível: %)', v_item->>'nome', v_qtd_disponivel;
    end if;

    v_nova_qtd := v_qtd_disponivel - (v_item->>'quantidade')::numeric;
    update estoque set quantidade = v_nova_qtd, updated_at = v_now where id = v_estoque_id;
    v_estoque_atualizado := v_estoque_atualizado || jsonb_build_object(v_item->>'produto_id', v_nova_qtd);
  end loop;

  v_venda_numero := nextval('venda_numero_seq');

  insert into vendas (numero, total, desconto, forma_pagamento_id, pessoa_id, observacoes, status, deposito_id, vendedor_id, vendedor_nome)
  values (v_venda_numero, v_total, p_desconto, v_forma_pag_id, p_pessoa_id, nullif(p_observacoes, ''), 'concluida', p_deposito_id, p_vendedor_id, p_vendedor_nome)
  returning id into v_venda_id;

  insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario, desconto_item, total_item)
  select v_venda_id, (item->>'produto_id'), (item->>'quantidade')::numeric, (item->>'preco_unitario')::numeric,
         0, (item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  -- Crédito do cliente usado como pagamento (atômico com a venda)
  if p_credito_valor > 0 and p_pessoa_id is not null then
    -- ↓↓↓ AQUI ESTÁ O FIX: 'estorno' agora SUBTRAI (antes caía no else e somava).
    select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0) into v_saldo_credito
    from creditos_clientes where pessoa_id = p_pessoa_id;
    if v_saldo_credito < p_credito_valor - 0.01 then
      raise exception 'Saldo de crédito insuficiente (disponível: %)', v_saldo_credito;
    end if;
    select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, venda_id)
    values (p_pessoa_id, v_pessoa_nome, p_credito_valor, 'uso', 'Usado na venda #' || v_venda_numero, v_venda_id::text);
  end if;

  -- Baixa dos aparelhos serializados vendidos
  if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) > 0 then
    for v_item in select * from jsonb_array_elements(p_series) loop
      update numeros_serie
      set status = 'vendido', venda_id = v_venda_id::text, updated_at = v_now
      where produto_id = (v_item->>'produto_id')
        and serie = (v_item->>'serie')
        and deposito_id = p_deposito_id
        and status = 'em_estoque';
      if not found then
        raise exception 'IMEI % indisponível no estoque deste depósito', v_item->>'serie';
      end if;
    end loop;
  end if;

  insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
  select v_venda_id, pag->>'forma_pagamento_id', (pag->>'valor')::numeric, (pag->>'taxa')::numeric,
         nullif(pag->>'maquina', ''), (pag->>'parcelas')::int, pag->>'status'
  from jsonb_array_elements(p_pagamentos) as pag;

  select
    coalesce(sum(case when pag->>'status' = 'pago' then (pag->>'valor')::numeric + (pag->>'taxa')::numeric else 0 end), 0),
    coalesce(sum(case when pag->>'status' = 'pendente' then (pag->>'valor')::numeric else 0 end), 0)
  into v_pago_total, v_fiado_total
  from jsonb_array_elements(p_pagamentos) as pag;

  if v_pago_total > 0 then
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, updated_at, venda_id)
    values ('Venda #' || v_venda_numero, v_pago_total, 'receber', v_today, v_today, 'pago', v_today, v_now, v_venda_id);
  end if;

  if v_fiado_total > 0 then
    if p_pessoa_id is not null then
      select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    end if;
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, pessoa_nome, updated_at, venda_id)
    values ('A Receber — Fiado #' || v_venda_numero, v_fiado_total, 'receber', v_today, v_today, 'pendente', v_pessoa_nome, v_now, v_venda_id);
  end if;

  return jsonb_build_object(
    'venda_id', v_venda_id, 'venda_numero', v_venda_numero,
    'total', v_total, 'estoque_atualizado', v_estoque_atualizado
  );
end;
$function$;
