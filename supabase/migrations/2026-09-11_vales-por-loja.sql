-- ============================================================
-- Vales-crédito SEPARADOS POR LOJA (decisão do dono 11/09).
-- Adiciona loja_id em creditos_clientes, backfill de Petrópolis e recria as RPCs
-- de saldo/uso/estorno/criação com escopo (pessoa_id + loja_id). Idempotente.
-- ============================================================

-- 1. Coluna + índices
alter table public.creditos_clientes add column if not exists loja_id uuid references public.lojas(id);
create index if not exists creditos_clientes_pessoa_loja_idx on public.creditos_clientes (pessoa_id, loja_id);
create index if not exists creditos_clientes_loja_idx on public.creditos_clientes (loja_id) where loja_id is not null;

-- 2. Backfill Petrópolis + relatório de registros sem loja (bloqueia ambiguidade)
do $$
declare
  v_petr  uuid;
  v_nulos integer;
  v_tere  integer;
begin
  if (select count(*) from lojas where nome = 'Petrópolis') <> 1 then
    raise exception 'Loja "Petrópolis" ausente ou duplicada em lojas — resolver antes de aplicar.';
  end if;
  select id into v_petr from lojas where nome = 'Petrópolis';

  select count(*) into v_nulos from creditos_clientes where loja_id is null;
  -- Guarda de ambiguidade: nada pode já estar marcado como Teresópolis sem loja.
  select count(*) into v_tere from creditos_clientes where loja_id is null and descricao ilike '%teres%';
  if v_tere > 0 then
    raise exception 'Há % registros de vale com "Teresópolis" na descrição e sem loja — resolver antes.', v_tere;
  end if;

  raise notice 'RELATÓRIO backfill vale: % registros sem loja ANTES.', v_nulos;
  update creditos_clientes set loja_id = v_petr where loja_id is null;
  select count(*) into v_nulos from creditos_clientes where loja_id is null;
  raise notice 'RELATÓRIO backfill vale: % registros sem loja DEPOIS (esperado 0).', v_nulos;
end $$;

-- ============================================================
-- 3. usar_credito_cliente — escopo loja (dropa a assinatura antiga sem loja)
-- ============================================================
drop function if exists public.usar_credito_cliente(text, numeric, text);
create or replace function public.usar_credito_cliente(
  p_pessoa_id  text,
  p_valor      numeric,
  p_descricao  text,
  p_loja_id    uuid
) returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_saldo numeric;
  v_nome  text;
begin
  if p_valor <= 0 then raise exception 'Valor inválido.'; end if;

  perform 1 from pessoas where id = p_pessoa_id for update;

  select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0)
    into v_saldo
  from creditos_clientes where pessoa_id = p_pessoa_id and loja_id = p_loja_id;

  if v_saldo < p_valor then
    raise exception 'Saldo de crédito insuficiente nesta loja (disponível: %).', v_saldo;
  end if;

  select nome into v_nome from pessoas where id = p_pessoa_id;

  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, loja_id)
  values (p_pessoa_id, coalesce(v_nome, 'Cliente'), p_valor, 'uso', p_descricao, p_loja_id);
end;
$function$;

revoke all on function public.usar_credito_cliente(text, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.usar_credito_cliente(text, numeric, text, uuid) to service_role;

-- ============================================================
-- 4. estornar_credito_cliente — escopo loja do próprio crédito
-- ============================================================
create or replace function public.estornar_credito_cliente(p_credito_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_c            record;
  v_saldo        numeric;
  v_venda_numero integer;
  v_today        date := (now() at time zone 'America/Sao_Paulo')::date;
  v_lanc_id      text := null;
begin
  select id, pessoa_id, pessoa_nome, valor, tipo, devolucao_id, loja_id
    into v_c from creditos_clientes where id = p_credito_id;
  if not found or v_c.tipo <> 'credito' then
    raise exception 'Movimento não é um crédito estornável.';
  end if;

  perform 1 from pessoas where id = v_c.pessoa_id for update;

  -- saldo DA MESMA LOJA do crédito (não o saldo global do cliente)
  select coalesce(sum(case when tipo in ('uso','estorno') then -valor else valor end), 0)
    into v_saldo from creditos_clientes where pessoa_id = v_c.pessoa_id and loja_id = v_c.loja_id;
  if v_saldo - v_c.valor < -0.01 then
    raise exception 'SALDO_INSUFICIENTE:%:%', v_saldo, v_c.valor;
  end if;

  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, estorna_credito_id, loja_id)
  values (v_c.pessoa_id, v_c.pessoa_nome, v_c.valor, 'estorno',
          'Estorno de crédito #' || p_credito_id, p_credito_id, v_c.loja_id);

  if v_c.devolucao_id is not null then
    select v.numero into v_venda_numero
      from devolucoes d left join vendas v on v.id = d.venda_id
     where d.id = v_c.devolucao_id;

    v_lanc_id := gen_random_uuid()::text;
    insert into lancamentos (id, descricao, valor, tipo, categoria,
                             data_competencia, data_vencimento, status, valor_pago,
                             pessoa_nome, loja_id, updated_at)
    values (v_lanc_id,
            'Estorno de crédito — devolução da venda #'
              || coalesce(v_venda_numero::text, '?') || ' — '
              || coalesce(v_c.pessoa_nome, 'Cliente'),
            v_c.valor, 'pagar', 'Estorno de crédito',
            v_today, v_today, 'pendente', 0,
            v_c.pessoa_nome, v_c.loja_id, now());
  end if;

  return jsonb_build_object('lancamento_id', v_lanc_id, 'valor', v_c.valor);
end;
$function$;

-- ============================================================
-- 5. finalizar_venda — vale consumido na LOJA do depósito da venda
-- ============================================================
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

-- ============================================================
-- 6. registrar_devolucao — crédito de devolução na LOJA do depósito da venda
-- ============================================================
-- ⚠️ NÃO recriada aqui de propósito. O corpo ATUAL (11 argumentos, com
-- p_reembolsos + desconto geral + conta por reembolso) NÃO está versionado em
-- migration — foi aplicado via MCP (ver 2026-08-26-devolucao-reembolso-misto.sql,
-- 2026-08-26-devolucao-reembolso-grava-conta.sql e 2026-09-06_devolucao_desconto_geral.sql).
-- Recriar a partir de migration antiga reverteria essas 3 correções e criaria
-- uma sobrecarga-fantasma (bug que 2026-08-26-drop-registrar-devolucao-10-args já
-- resolveu).
--
-- Patch de loja a aplicar via MCP sobre o corpo real (pg_get_functiondef):
--   1) declare v_loja_id uuid;
--   2) após v_deposito resolvido: select loja_id into v_loja_id from depositos where id = v_deposito;
--   3) em TODO insert em creditos_clientes (reembolso 'credito_conta', inclusive
--      dentro do loop de p_reembolsos), incluir a coluna loja_id = v_loja_id.
-- Passo a passo: scripts-sinc/registrar-devolucao-loja.md

-- ============================================================
-- 7. receber_fiados_vale — escopo loja (vale e fiado na MESMA loja)
-- ============================================================
drop function if exists public.receber_fiados_vale(text, jsonb, uuid, text);
create or replace function public.receber_fiados_vale(
  p_pessoa_id   text,
  p_alocacoes   jsonb,
  p_operacao_id uuid,
  p_loja_id     uuid,
  p_usuario     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_aloc      jsonb;
  v_lanc      record;
  v_id        text;
  v_dono      text;
  v_loja_lanc uuid;
  v_valor     numeric;
  v_saldo     numeric;
  v_total     numeric := 0;
  v_quitado   boolean;
  v_resultado jsonb := '[]'::jsonb;
  v_pedido    jsonb;
  v_anterior  recebimentos_lote_operacoes%rowtype;
  v_nome      text;
  v_today     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora     timestamptz := now();
begin
  if p_operacao_id is null then raise exception 'Operação obrigatória.'; end if;
  if p_pessoa_id is null then raise exception 'Cliente não identificado para usar vale-crédito.'; end if;
  if p_loja_id is null then raise exception 'Loja não identificada para usar vale-crédito.'; end if;
  if jsonb_array_length(coalesce(p_alocacoes, '[]'::jsonb)) = 0 then raise exception 'Nenhuma dívida selecionada.'; end if;
  if (select count(*) from jsonb_array_elements(p_alocacoes)) <>
     (select count(distinct item->>'id') from jsonb_array_elements(p_alocacoes) item) then
    raise exception 'Dívida repetida no lote.';
  end if;

  v_pedido := jsonb_build_object(
    'tipo', 'vale', 'pessoa', p_pessoa_id, 'loja', p_loja_id,
    'alocacoes', (select coalesce(jsonb_agg(item order by item->>'id'), '[]'::jsonb)
                   from jsonb_array_elements(p_alocacoes) item),
    'usuario', p_usuario
  );
  insert into recebimentos_lote_operacoes(id, pedido) values(p_operacao_id, v_pedido) on conflict do nothing;
  select * into v_anterior from recebimentos_lote_operacoes where id = p_operacao_id for update;
  if v_anterior.pedido is distinct from v_pedido then raise exception 'Operação reutilizada com dados diferentes.'; end if;
  if v_anterior.resultado is not null then return v_anterior.resultado; end if;

  select nome into v_nome from pessoas where id = p_pessoa_id for update;
  if not found then raise exception 'Cliente não encontrado.'; end if;

  select coalesce(sum(case when tipo in ('uso','estorno') then -valor else valor end), 0)
    into v_saldo from creditos_clientes where pessoa_id = p_pessoa_id and loja_id = p_loja_id;

  select coalesce(sum(round(coalesce((item->>'valor')::numeric, 0), 2)), 0)
    into v_total from jsonb_array_elements(p_alocacoes) item
   where round(coalesce((item->>'valor')::numeric, 0), 2) > 0;

  if v_total <= 0 then raise exception 'Valor deve ser positivo.'; end if;
  if v_saldo < v_total then
    raise exception 'Saldo de crédito insuficiente nesta loja (disponível: %).', v_saldo;
  end if;

  for v_aloc in select item from jsonb_array_elements(p_alocacoes) item order by item->>'id' loop
    v_id := v_aloc->>'id';
    v_valor := round(coalesce((v_aloc->>'valor')::numeric, 0), 2);
    if v_valor <= 0 then continue; end if;

    select l.id, l.valor, l.valor_pago, l.pessoa_nome, l.codigo, l.pessoa_id, l.venda_id, l.status, l.loja_id
      into v_lanc
      from lancamentos l
     where l.id = v_id and l.tipo = 'receber' and l.status = 'pendente'
     for update;
    if not found then raise exception 'Dívida % não está disponível para recebimento com vale.', v_id; end if;

    -- dono da dívida (pessoa_id do lançamento, senão da venda)
    v_dono := v_lanc.pessoa_id;
    if v_dono is null and v_lanc.venda_id is not null then
      select pessoa_id into v_dono from vendas where id = v_lanc.venda_id;
    end if;
    if v_dono is null then
      raise exception 'Fiado % não tem cliente identificado para usar vale-crédito.', coalesce(v_lanc.codigo::text, v_id);
    end if;
    if v_dono is distinct from p_pessoa_id then
      raise exception 'Fiado % pertence a outro cliente.', coalesce(v_lanc.codigo::text, v_id);
    end if;

    -- loja da dívida (lançamento, senão venda→depósito)
    v_loja_lanc := v_lanc.loja_id;
    if v_loja_lanc is null and v_lanc.venda_id is not null then
      select d.loja_id into v_loja_lanc from vendas v join depositos d on d.id = v.deposito_id where v.id = v_lanc.venda_id;
    end if;
    if v_loja_lanc is distinct from p_loja_id then
      raise exception 'Fiado % pertence a outra loja — vale-crédito só quita fiado da MESMA loja.', coalesce(v_lanc.codigo::text, v_id);
    end if;

    if v_valor > round(v_lanc.valor - coalesce(v_lanc.valor_pago, 0), 2) then
      raise exception 'Valor maior que saldo da dívida %.', v_id;
    end if;

    v_quitado := coalesce(v_lanc.valor_pago, 0) + v_valor >= v_lanc.valor;

    update lancamentos set
      valor_pago = coalesce(valor_pago, 0) + v_valor,
      forma_pagamento = 'Vale Crédito',
      conta_id = null,
      status = case when v_quitado then 'pago' else status end,
      data_pagamento = case when v_quitado then v_today else data_pagamento end,
      historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'valor', v_valor, 'forma', 'Vale Crédito',
        'data', to_char(v_agora at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS'),
        'operacao_id', p_operacao_id::text, 'usuario', coalesce(p_usuario, '')
      )),
      updated_at = v_agora
    where id = v_lanc.id;

    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, lancamento_id, loja_id)
    values (p_pessoa_id, coalesce(v_lanc.pessoa_nome, v_nome, 'Cliente'), v_valor, 'uso',
            'Uso no fiado #' || coalesce(v_lanc.codigo::text, v_id), v_id, p_loja_id);

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object('id', v_id, 'valor', v_valor, 'quitado', v_quitado));
  end loop;

  v_resultado := jsonb_build_object('total', v_total, 'pagamentos', v_resultado);
  update recebimentos_lote_operacoes set resultado = v_resultado where id = p_operacao_id;
  return v_resultado;
end;
$function$;

revoke all on function public.receber_fiados_vale(text, jsonb, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.receber_fiados_vale(text, jsonb, uuid, uuid, text) to service_role;
