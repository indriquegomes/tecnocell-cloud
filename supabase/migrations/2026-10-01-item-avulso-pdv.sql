-- Item avulso no PDV: vender um item sem produto cadastrado (encomenda que
-- ainda não virou produto no sistema). O item entra com produto_id NULL e o nome
-- digitado na hora. Não baixa estoque (não há produto), não pega IMEI, não entra
-- em promoção. Apenas registra a venda + o item com o nome.

alter table public.itens_venda add column if not exists nome text;

-- finalizar_venda: pula a baixa de estoque para item sem produto (produto_id nulo/vazio)
-- e grava o nome do item avulso.
create or replace function public.finalizar_venda(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb DEFAULT '[]'::jsonb, p_vendedor_id uuid DEFAULT NULL::uuid, p_vendedor_nome text DEFAULT NULL::text, p_credito_valor numeric DEFAULT 0, p_tipo_entrega text DEFAULT 'retirada', p_endereco_entrega text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  v_loja_id            uuid;
  v_today              date;
  v_now                timestamptz;
  v_estoque_atualizado jsonb := '{}'::jsonb;
  v_soma_pagamentos    numeric := 0;
  v_permite_negativo   boolean;
begin
  v_today := (now() at time zone 'America/Sao_Paulo')::date;
  v_now   := now();

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_subtotal := v_subtotal + (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric;
  end loop;

  v_total_produtos := greatest(0, v_subtotal - p_desconto);

  for v_pag in select * from jsonb_array_elements(p_pagamentos) loop
    v_total_taxas := v_total_taxas + (v_pag->>'taxa')::numeric;
  end loop;

  v_total := v_total_produtos + v_total_taxas;

  select coalesce(sum((pag->>'valor')::numeric), 0) into v_soma_pagamentos
  from jsonb_array_elements(p_pagamentos) as pag;

  if exists (select 1 from jsonb_array_elements(p_pagamentos) as pag
             where (pag->>'valor')::numeric < 0 or (pag->>'taxa')::numeric < 0) then
    raise exception 'Pagamento com valor ou taxa negativa não é permitido';
  end if;
  if coalesce(p_credito_valor, 0) < 0 then
    raise exception 'Crédito com valor negativo não é permitido';
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
    -- Item avulso (sem produto cadastrado): não tem estoque pra baixar
    if nullif(v_item->>'produto_id', '') is null then
      continue;
    end if;

    select id, quantidade into v_estoque_id, v_qtd_disponivel
    from estoque
    where deposito_id = p_deposito_id and produto_id = (v_item->>'produto_id')
    for update;

    if not found then
      raise exception 'Produto "%" não encontrado no estoque do depósito', v_item->>'nome';
    end if;
    select permite_estoque_negativo into v_permite_negativo from produtos where id = (v_item->>'produto_id');
    if not coalesce(v_permite_negativo, false) and v_qtd_disponivel < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente para "%" (disponível: %)', v_item->>'nome', v_qtd_disponivel;
    end if;

    v_nova_qtd := v_qtd_disponivel - (v_item->>'quantidade')::numeric;
    update estoque set quantidade = v_nova_qtd, updated_at = v_now where id = v_estoque_id;
    v_estoque_atualizado := v_estoque_atualizado || jsonb_build_object(v_item->>'produto_id', v_nova_qtd);
  end loop;

  v_venda_numero := nextval('venda_numero_seq');

  insert into vendas (numero, total, desconto, forma_pagamento_id, pessoa_id, observacoes, status, deposito_id, vendedor_id, vendedor_nome, tipo_entrega, endereco_entrega)
  values (v_venda_numero, v_total, p_desconto, v_forma_pag_id, p_pessoa_id, nullif(p_observacoes, ''), 'concluida', p_deposito_id, p_vendedor_id, p_vendedor_nome, coalesce(p_tipo_entrega, 'retirada'), nullif(p_endereco_entrega, ''))
  returning id into v_venda_id;

  insert into itens_venda (venda_id, produto_id, nome, quantidade, preco_unitario, desconto_item, total_item)
  select v_venda_id,
         nullif(item->>'produto_id', ''),
         case when nullif(item->>'produto_id', '') is null then nullif(item->>'nome', '') else null end,
         (item->>'quantidade')::numeric, (item->>'preco_unitario')::numeric,
         0, (item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  select loja_id into v_loja_id from depositos where id = p_deposito_id;

  if p_credito_valor > 0 and p_pessoa_id is not null then
    perform 1 from pessoas where id = p_pessoa_id for update;
    select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0) into v_saldo_credito
    from creditos_clientes where pessoa_id = p_pessoa_id and loja_id = v_loja_id;
    if v_saldo_credito < p_credito_valor then
      raise exception 'Saldo de crédito insuficiente nesta loja (disponível: %)', v_saldo_credito;
    end if;
    select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, venda_id, loja_id)
    values (p_pessoa_id, v_pessoa_nome, p_credito_valor, 'uso', 'Usado na venda #' || v_venda_numero, v_venda_id::text, v_loja_id);

    insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
    values (v_venda_id, 'FP_VALE', p_credito_valor, 0, null, 1, 'vale');
  end if;

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

-- cancelar_venda: item avulso (produto_id NULL) não tem estoque pra devolver —
-- pula a reposição pra não criar uma linha fantasma de estoque com produto nulo.
CREATE OR REPLACE FUNCTION public.cancelar_venda(p_venda_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status      text;
  v_deposito    text;
  v_numero      integer;
  v_pessoa_id   text;
  v_item        record;
  v_est_id      uuid;
  v_now         timestamptz := now();
  v_devolvido   numeric := 0;
  v_imeis       int := 0;
  v_lancs       int := 0;
  v_credito     numeric := 0;
  v_ja_devolvido numeric;
  v_a_devolver   numeric;
begin
  -- 1. trava a venda
  select status, deposito_id, numero, pessoa_id
    into v_status, v_deposito, v_numero, v_pessoa_id
  from vendas where id = p_venda_id
  for update;

  if not found then
    raise exception 'Venda não encontrada';
  end if;
  if v_status = 'cancelada' then
    return jsonb_build_object('ja_cancelada', true, 'venda_numero', v_numero);
  end if;

  -- 2. devolve o estoque dos itens (só a parte que ainda não voltou via devolução parcial)
  for v_item in
    select produto_id, quantidade from itens_venda where venda_id = p_venda_id
  loop
    if v_item.produto_id is null then
      continue;  -- item avulso: não tem estoque pra devolver
    end if;
    select coalesce(sum(idv.quantidade), 0) into v_ja_devolvido
    from itens_devolucao idv
    join devolucoes d on d.id = idv.devolucao_id
    where d.venda_id = p_venda_id and idv.produto_id = v_item.produto_id;

    v_a_devolver := greatest(0, v_item.quantidade - v_ja_devolvido);
    if v_a_devolver > 0 then
      select id into v_est_id from estoque
      where produto_id = v_item.produto_id and deposito_id = v_deposito
      for update;

      if found then
        update estoque
          set quantidade = quantidade + v_a_devolver, updated_at = v_now
        where id = v_est_id;
      else
        insert into estoque (produto_id, deposito_id, quantidade, updated_at)
        values (v_item.produto_id, v_deposito, v_a_devolver, v_now);
      end if;
      v_devolvido := v_devolvido + v_a_devolver;
    end if;
  end loop;

  -- 3. IMEIs vendidos voltam pro estoque
  update numeros_serie
    set status = 'em_estoque', venda_id = null, deposito_id = v_deposito, updated_at = v_now
  where venda_id = p_venda_id::text and status = 'vendido';
  get diagnostics v_imeis = row_count;

  -- 4. lançamentos da venda saem do financeiro
  delete from lancamentos where venda_id = p_venda_id;
  get diagnostics v_lancs = row_count;

  -- 5. crédito de cliente usado na venda volta pro saldo dele
  select coalesce(sum(valor), 0) into v_credito
  from creditos_clientes
  where venda_id = p_venda_id::text and tipo = 'uso';

  if v_credito > 0 then
    delete from creditos_clientes
    where venda_id = p_venda_id::text and tipo = 'uso';
  end if;

  -- 6. marca como cancelada (NÃO apaga — o histórico fica)
  update vendas
    set status = 'cancelada',
        observacoes = coalesce(observacoes || ' | ', '') || 'CANCELADA' ||
                      coalesce(': ' || nullif(trim(p_motivo), ''), '')
  where id = p_venda_id;

  return jsonb_build_object(
    'venda_numero',      v_numero,
    'estoque_devolvido', v_devolvido,
    'imeis_devolvidos',  v_imeis,
    'lancamentos_removidos', v_lancs,
    'credito_estornado', v_credito
  );
end;
$function$;
