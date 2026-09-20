-- ============================================================================
-- Revisão 19/09 (segunda leva): trava de raça + validação de negativos + loja (19/09)
--   1) registrar_devolucao: FOR UPDATE no fiado (race devolução × recebimento).
--   2) finalizar_venda: rejeita taxa e crédito negativos.
--   3) receber_lancamentos_lote: rejeita dívida SEM loja (antes só barrava loja errada).
--   4) aplicar_desconto_fiado (nova): desconto atômico no fiado (sem read-modify-write).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_devolucao(p_venda_id uuid, p_deposito_id text, p_pessoa_id text, p_pessoa_nome text, p_vendedor_nome text, p_motivo text, p_tipo_credito text, p_itens jsonb, p_lancamento_pendente boolean, p_series jsonb DEFAULT '[]'::jsonb, p_reembolsos jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_devolucao_id   uuid := gen_random_uuid();
  v_valor_total    numeric := 0;
  v_item           jsonb;
  v_s              jsonb;
  v_deposito       text;
  v_loja_id        uuid;
  v_estoque_id     uuid;
  v_reaproveitavel boolean;
  v_today          date := (now() at time zone 'America/Sao_Paulo')::date;
  v_now            timestamptz := now();
  v_fiado_lanc_id  text;
  v_fiado_restante numeric;
  v_abate_fiado    numeric := 0;
  v_reembolso      numeric := 0;
  v_vendido        numeric;
  v_ja_devolvido   numeric;
  v_r              jsonb;
  v_soma_reemb     numeric := 0;
  v_reemb_dinheiro numeric := 0;
  v_tipo_r         text;
  v_valor_r        numeric;
  v_conta_r        uuid;
begin
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

  -- ═══ VALOR REAL — nunca confia no total_item/preco_unitario do chamador ═══
  select coalesce(sum(round(coalesce(iv.preco_medio, 0) * (item->>'quantidade')::numeric, 2)), 0)
  into v_valor_total
  from jsonb_array_elements(p_itens) as item
  left join lateral (
    select sum(total_item) / nullif(sum(quantidade), 0) * coalesce((select greatest(0, 1 - coalesce(v.desconto,0) / nullif((select sum(x.total_item) from public.itens_venda x where x.venda_id = p_venda_id),0)) from public.vendas v where v.id = p_venda_id),1) as preco_medio
    from itens_venda
    where venda_id = p_venda_id and produto_id = item->>'produto_id'
  ) iv on true;

  v_deposito := p_deposito_id;
  if v_deposito is null then
    select id into v_deposito from depositos order by nome limit 1;
  end if;
  if v_deposito is null then
    raise exception 'Nenhum depósito cadastrado para retornar o estoque.';
  end if;
  select loja_id into v_loja_id from depositos where id = v_deposito;

  insert into devolucoes (id, venda_id, deposito_id, pessoa_nome, vendedor_nome, motivo, valor_total, tipo_credito, status)
  values (v_devolucao_id, p_venda_id, v_deposito, coalesce(p_pessoa_nome, 'Cliente Final'),
          p_vendedor_nome, nullif(p_motivo, ''), v_valor_total, p_tipo_credito, 'concluida');

  insert into itens_devolucao (devolucao_id, produto_id, nome, quantidade, preco_unitario, total_item, status_produto)
  select v_devolucao_id, item->>'produto_id', item->>'nome', (item->>'quantidade')::numeric,
         round(coalesce(iv.preco_medio, 0), 2),
         round(coalesce(iv.preco_medio, 0) * (item->>'quantidade')::numeric, 2),
         coalesce(item->>'status_produto', 'ok')
  from jsonb_array_elements(p_itens) as item
  left join lateral (
    select sum(total_item) / nullif(sum(quantidade), 0) * coalesce((select greatest(0, 1 - coalesce(v.desconto,0) / nullif((select sum(x.total_item) from public.itens_venda x where x.venda_id = p_venda_id),0)) from public.vendas v where v.id = p_venda_id),1) as preco_medio
    from itens_venda
    where venda_id = p_venda_id and produto_id = item->>'produto_id'
  ) iv on true;

  -- retorno ao estoque — só 'ok' volta ao vendável
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

  -- FOR UPDATE: trava a linha do fiado — sem isso, recebimento e devolução
  -- concorrentes liam o mesmo valor_pago e o cliente podia pagar e perder.
  select id, (valor - coalesce(valor_pago, 0))
  into v_fiado_lanc_id, v_fiado_restante
  from lancamentos
  where venda_id = p_venda_id and status = 'pendente' and tipo = 'receber'
  order by created_at limit 1
  for update;

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
    -- ═══ MODO MISTO: várias formas de reembolso numa devolução só ═══
    if p_reembolsos is not null and jsonb_array_length(p_reembolsos) > 0 then
      select coalesce(sum((r->>'valor')::numeric), 0) into v_soma_reemb
      from jsonb_array_elements(p_reembolsos) as r;

      if exists (select 1 from jsonb_array_elements(p_reembolsos) as r where (r->>'valor')::numeric < 0) then
        raise exception 'Reembolso com valor negativo não é permitido';
      end if;

      if abs(v_soma_reemb - v_reembolso) > 0.01 then
        raise exception 'As formas de reembolso não fecham: somaram R$ %, mas o reembolso é R$ %',
          round(v_soma_reemb, 2), round(v_reembolso, 2);
      end if;

      for v_r in select * from jsonb_array_elements(p_reembolsos) loop
        v_tipo_r  := v_r->>'tipo';
        v_valor_r := (v_r->>'valor')::numeric;
        v_conta_r := nullif(v_r->>'conta_id', '')::uuid;
        if v_valor_r <= 0.005 then continue; end if;

        if v_tipo_r = 'credito_conta' then
          if p_pessoa_id is not null then
            insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, loja_id)
            values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_valor_r, 'credito', 'Devolução de compra', v_devolucao_id, v_loja_id);
          end if;
        elsif v_tipo_r = 'dinheiro' then
          -- dinheiro sai da GAVETA (movimento de caixa, registrado na action)
          v_reemb_dinheiro := v_reemb_dinheiro + v_valor_r;
        elsif v_tipo_r not in ('sem_reembolso', 'cancelamento_fiado') then
          insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, conta_id, updated_at)
          values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_valor_r, 'pagar', v_today, v_today, 'pago', v_today, v_tipo_r, p_pessoa_nome, v_conta_r, v_now);
        end if;
      end loop;

    -- ═══ MODO ANTIGO: uma forma só (segue idêntico) ═══
    else
      if p_tipo_credito = 'credito_conta' then
        if p_pessoa_id is not null then
          insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, loja_id)
          values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'credito', 'Devolução de compra', v_devolucao_id, v_loja_id);
        end if;
      elsif p_tipo_credito = 'dinheiro' then
        v_reemb_dinheiro := v_reembolso;
      elsif p_tipo_credito not in ('sem_reembolso', 'cancelamento_fiado') then
        insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, updated_at)
        values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'pagar', v_today, v_today, 'pago', v_today, p_tipo_credito, p_pessoa_nome, v_now);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'devolucao_id', v_devolucao_id,
    'abate_fiado', v_abate_fiado,
    'reembolso', v_reembolso,
    'reembolso_dinheiro', v_reemb_dinheiro
  );
end;
$function$;


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

  insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario, desconto_item, total_item)
  select v_venda_id, (item->>'produto_id'), (item->>'quantidade')::numeric, (item->>'preco_unitario')::numeric,
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



create or replace function public.aplicar_desconto_fiado(
  p_lancamento_id text,
  p_desconto numeric,
  p_motivo text
) returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  v_valor numeric;
  v_pago numeric;
  v_restante numeric;
  v_aplicado numeric;
  v_novo numeric;
  v_quitado boolean;
begin
  select valor, coalesce(valor_pago, 0) into v_valor, v_pago
  from lancamentos where id = p_lancamento_id and tipo = 'receber' and status = 'pendente' for update;
  if not found then raise exception 'Lançamento não encontrado ou já quitado.'; end if;
  v_restante := round(v_valor - v_pago, 2);
  v_aplicado := least(round(p_desconto, 2), v_restante);
  if v_aplicado <= 0 then raise exception 'Desconto inválido.'; end if;
  v_novo := round(v_valor - v_aplicado, 2);
  v_quitado := v_pago >= v_novo;
  update lancamentos set
    valor = v_novo,
    status = case when v_quitado then 'pago' else status end,
    data_pagamento = case when v_quitado then (now() at time zone 'America/Sao_Paulo')::date else data_pagamento end,
    historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'valor', v_aplicado, 'forma', case when nullif(trim(p_motivo), '') is not null then 'Desconto — ' || trim(p_motivo) else 'Desconto' end, 'data', now(), 'tipo', 'desconto')),
    updated_at = now()
  where id = p_lancamento_id;
  return jsonb_build_object('quitado', v_quitado, 'novo_valor', v_novo, 'desconto_aplicado', v_aplicado);
end;
$function$;

revoke all on function public.aplicar_desconto_fiado(text, numeric, text) from public, anon, authenticated;
grant execute on function public.aplicar_desconto_fiado(text, numeric, text) to service_role;

create or replace function public.receber_lancamentos_lote(
  p_alocacoes jsonb, p_forma text, p_conta_id uuid, p_loja_id uuid, p_operacao_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_aloc jsonb;
  v_lanc lancamentos%rowtype;
  v_valor numeric;
  v_total numeric := 0;
  v_quitado boolean;
  v_resultado jsonb := '[]'::jsonb;
  v_caixa_id uuid;
  v_pedido jsonb;
  v_anterior recebimentos_lote_operacoes%rowtype;
begin
  if p_operacao_id is null then raise exception 'Operação obrigatória.'; end if;
  v_pedido := jsonb_build_object('alocacoes', p_alocacoes, 'forma', p_forma, 'conta', p_conta_id, 'loja', p_loja_id);
  insert into recebimentos_lote_operacoes(id, pedido) values(p_operacao_id, v_pedido) on conflict do nothing;
  select * into v_anterior from recebimentos_lote_operacoes where id = p_operacao_id for update;
  if v_anterior.pedido is distinct from v_pedido then raise exception 'Operação reutilizada com dados diferentes.'; end if;
  if v_anterior.resultado is not null then return v_anterior.resultado; end if;
  select id into v_caixa_id from caixas where status = 'aberto' and loja_id = p_loja_id order by aberto_em desc limit 1 for update;
  if v_caixa_id is null then raise exception 'Abra o caixa da loja antes de receber.'; end if;
  if nullif(trim(p_forma), '') is null then raise exception 'Escolha uma forma de pagamento.'; end if;
  if jsonb_array_length(coalesce(p_alocacoes, '[]'::jsonb)) = 0 then raise exception 'Nenhuma dívida selecionada.'; end if;
  if (select count(*) from jsonb_array_elements(p_alocacoes)) <>
     (select count(distinct item->>'id') from jsonb_array_elements(p_alocacoes) item) then
    raise exception 'Dívida repetida no lote.';
  end if;

  for v_aloc in select item from jsonb_array_elements(p_alocacoes) item order by item->>'id' loop
    v_valor := round(coalesce((v_aloc->>'valor')::numeric, 0), 2);
    if v_valor <= 0 then continue; end if;
    select * into v_lanc from lancamentos
      where id = v_aloc->>'id' and tipo = 'receber' and status = 'pendente' for update;
    if not found then raise exception 'Dívida % não está disponível para recebimento.', v_aloc->>'id'; end if;
    if v_lanc.loja_id is null or v_lanc.loja_id is distinct from p_loja_id then raise exception 'Dívida sem loja ou de outra loja — vincule a loja antes de receber.'; end if;
    if v_valor > round(v_lanc.valor - coalesce(v_lanc.valor_pago, 0), 2) then
      raise exception 'Valor maior que saldo da dívida %.', v_lanc.id;
    end if;
    v_quitado := coalesce(v_lanc.valor_pago, 0) + v_valor >= v_lanc.valor;
    update lancamentos set
      valor_pago = coalesce(valor_pago, 0) + v_valor,
      forma_pagamento = p_forma,
      conta_id = case when v_quitado then p_conta_id else conta_id end,
      status = case when v_quitado then 'pago' else status end,
      data_pagamento = case when v_quitado then (now() at time zone 'America/Sao_Paulo')::date else data_pagamento end,
      historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'valor', v_valor, 'forma', p_forma, 'data', now()
      )), updated_at = now()
    where id = v_lanc.id;
    v_total := v_total + v_valor;
    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object('id', v_lanc.id, 'valor', v_valor, 'quitado', v_quitado));
  end loop;

  if v_caixa_id is not null and v_total > 0 then
    insert into movimentos_caixa(caixa_id, tipo, motivo, forma_pagamento, valor)
    values(v_caixa_id, 'recebimento', 'Fiado recebido — lote', p_forma, v_total);
  end if;
  if v_total <= 0 then raise exception 'Valor deve ser positivo.'; end if;
  v_resultado := jsonb_build_object('total', v_total, 'pagamentos', v_resultado);
  update recebimentos_lote_operacoes set resultado = v_resultado where id = p_operacao_id;
  return v_resultado;
end;
$$;

revoke all on function public.receber_lancamentos_lote(jsonb,text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.receber_lancamentos_lote(jsonb,text,uuid,uuid,uuid) to service_role;
