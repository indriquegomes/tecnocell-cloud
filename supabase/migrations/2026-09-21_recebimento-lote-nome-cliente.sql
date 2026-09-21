-- Recebimento de fiado EM LOTE: o movimento de caixa gravava o motivo fixo
-- "Fiado recebido — lote" mesmo quando o lote inteiro era de UM cliente. Agora o
-- motivo traz o nome do cliente (ou "N clientes" quando o lote mistura mais de um),
-- pra quem confere o caixa saber de quem é o dinheiro sem abrir o detalhe.
--
-- Mesmo corpo da última versão (2026-09-19_finalizar-devolucao-recebimento-atomico.sql),
-- alterado só: (1) coleção dos nomes distintos no loop, (2) montagem do motivo, (3)
-- insert usa v_motivo em vez do literal.
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
  v_nomes text[] := '{}'::text[];
  v_motivo text;
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
    if v_lanc.pessoa_nome is not null and v_lanc.pessoa_nome <> '' and not (v_lanc.pessoa_nome = any(v_nomes)) then
      v_nomes := v_nomes || v_lanc.pessoa_nome;
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

  v_motivo := case
    when array_length(v_nomes, 1) = 1 then 'Fiado recebido — ' || v_nomes[1]
    when coalesce(array_length(v_nomes, 1), 0) > 1 then 'Fiado recebido — ' || array_length(v_nomes, 1) || ' clientes'
    else 'Fiado recebido — lote'
  end;

  if v_caixa_id is not null and v_total > 0 then
    insert into movimentos_caixa(caixa_id, tipo, motivo, forma_pagamento, valor)
    values(v_caixa_id, 'recebimento', v_motivo, p_forma, v_total);
  end if;
  if v_total <= 0 then raise exception 'Valor deve ser positivo.'; end if;
  v_resultado := jsonb_build_object('total', v_total, 'pagamentos', v_resultado);
  update recebimentos_lote_operacoes set resultado = v_resultado where id = p_operacao_id;
  return v_resultado;
end;
$$;

revoke all on function public.receber_lancamentos_lote(jsonb,text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.receber_lancamentos_lote(jsonb,text,uuid,uuid,uuid) to service_role;
