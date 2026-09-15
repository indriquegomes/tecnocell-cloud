-- Vale-crédito para quitar fiado em aberto — total, parcial e em LOTE — numa
-- transação só. Antes o vale no fiado avulso era TypeScript em 3 passos sem
-- transação (usar_credito_cliente → update lancamentos → registrarNoCaixa): se o
-- update do fiado falhasse depois do débito, o vale sumia e a dívida não caía
-- (mesmo bug de estorno que estornar_credito_cliente corrigiu). O lote
-- (receber_lancamentos_lote) nunca aceitou vale.
--
-- Esta RPC faz tudo atômico: trava a pessoa (serializa contra uso concorrente do
-- mesmo vale), trava cada fiado com FOR UPDATE, valida cliente/saldo/restante,
-- baixa valor_pago/status, grava o histórico (forma, operacao_id, usuário, data
-- de São Paulo) e insere o 'uso' em creditos_clientes com vínculo ao lançamento
-- (coluna lancamento_id). NÃO mexe em movimentos_caixa, NÃO exige caixa aberto e
-- deixa conta_id null — vale-crédito não é dinheiro entrando.
--
-- Idempotência reusa recebimentos_lote_operacoes (mesma tabela do lote em
-- dinheiro): mesmo operacao_id → devolve o resultado já calculado, barrando o
-- clique duplo. A distribuição "da dívida mais antiga" é feita no cliente
-- (lib/pdv-calculos.ts distribuirRecebimento) e o ajuste individual chega pronto
-- em p_alocacoes; aqui só aplica o que veio, validando cada valor contra o
-- restante da própria dívida.

alter table public.creditos_clientes add column if not exists lancamento_id text;

create or replace function public.receber_fiados_vale(
  p_pessoa_id   text,
  p_alocacoes   jsonb,
  p_operacao_id uuid,
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
  if jsonb_array_length(coalesce(p_alocacoes, '[]'::jsonb)) = 0 then raise exception 'Nenhuma dívida selecionada.'; end if;
  if (select count(*) from jsonb_array_elements(p_alocacoes)) <>
     (select count(distinct item->>'id') from jsonb_array_elements(p_alocacoes) item) then
    raise exception 'Dívida repetida no lote.';
  end if;

  -- Idempotência: assinatura do pedido ordenada por id (estável). Reuso do mesmo
  -- operacao_id com dados diferentes é recusado; com dados iguais devolve o cache.
  v_pedido := jsonb_build_object(
    'tipo', 'vale',
    'pessoa', p_pessoa_id,
    'alocacoes', (select coalesce(jsonb_agg(item order by item->>'id'), '[]'::jsonb)
                   from jsonb_array_elements(p_alocacoes) item),
    'usuario', p_usuario
  );
  insert into recebimentos_lote_operacoes(id, pedido) values(p_operacao_id, v_pedido) on conflict do nothing;
  select * into v_anterior from recebimentos_lote_operacoes where id = p_operacao_id for update;
  if v_anterior.pedido is distinct from v_pedido then raise exception 'Operação reutilizada com dados diferentes.'; end if;
  if v_anterior.resultado is not null then return v_anterior.resultado; end if;

  -- Serializa contra outro uso de vale do MESMO cliente (mesmo padrão de
  -- finalizar_venda/usar_credito_cliente: lock na pessoa, não no saldo agregado).
  select nome into v_nome from pessoas where id = p_pessoa_id for update;
  if not found then raise exception 'Cliente não encontrado.'; end if;

  select coalesce(sum(case when tipo in ('uso','estorno') then -valor else valor end), 0)
    into v_saldo from creditos_clientes where pessoa_id = p_pessoa_id;

  select coalesce(sum(round(coalesce((item->>'valor')::numeric, 0), 2)), 0)
    into v_total from jsonb_array_elements(p_alocacoes) item
   where round(coalesce((item->>'valor')::numeric, 0), 2) > 0;

  if v_total <= 0 then raise exception 'Valor deve ser positivo.'; end if;
  if v_saldo < v_total then
    raise exception 'Saldo de crédito insuficiente (disponível: %).', v_saldo;
  end if;

  -- ordem estável por id (mesma do receber_lancamentos_lote) pra evitar deadlock
  -- entre dois recebimentos concorrentes que travariam dívidas em ordens diferentes.
  for v_aloc in select item from jsonb_array_elements(p_alocacoes) item order by item->>'id' loop
    v_id := v_aloc->>'id';
    v_valor := round(coalesce((v_aloc->>'valor')::numeric, 0), 2);
    if v_valor <= 0 then continue; end if;

    select l.id, l.valor, l.valor_pago, l.pessoa_nome, l.codigo, l.pessoa_id, l.venda_id, l.status
      into v_lanc
      from lancamentos l
     where l.id = v_id and l.tipo = 'receber' and l.status = 'pendente'
     for update;
    if not found then raise exception 'Dívida % não está disponível para recebimento com vale.', v_id; end if;

    -- Dono da dívida: pessoa_id direto do lançamento, senão da venda (fiado de
    -- venda não grava pessoa_id no lançamento — a fonte é vendas.pessoa_id).
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

    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, lancamento_id)
    values (p_pessoa_id, coalesce(v_lanc.pessoa_nome, v_nome, 'Cliente'), v_valor, 'uso',
            'Uso no fiado #' || coalesce(v_lanc.codigo::text, v_id), v_id);

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object('id', v_id, 'valor', v_valor, 'quitado', v_quitado));
  end loop;

  v_resultado := jsonb_build_object('total', v_total, 'pagamentos', v_resultado);
  update recebimentos_lote_operacoes set resultado = v_resultado where id = p_operacao_id;
  return v_resultado;
end;
$function$;

revoke all on function public.receber_fiados_vale(text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.receber_fiados_vale(text, jsonb, uuid, text) to service_role;
