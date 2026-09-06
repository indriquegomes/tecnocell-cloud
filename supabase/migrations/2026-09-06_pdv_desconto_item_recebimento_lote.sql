-- Mantém finalizar_venda como fonte única e ajusta apenas itens com desconto unitário.
create or replace function public.finalizar_venda_com_desconto_item(
  p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric,
  p_observacoes text, p_deposito_id text, p_series jsonb default '[]'::jsonb,
  p_vendedor_id uuid default null, p_vendedor_nome text default null,
  p_credito_valor numeric default 0, p_tipo_entrega text default 'retirada',
  p_endereco_entrega text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_itens_liquidos jsonb;
  v_resultado jsonb;
  v_venda_id uuid;
begin
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
    where coalesce((i->>'desconto_item')::numeric, 0) < 0
       or coalesce((i->>'desconto_item')::numeric, 0) > (i->>'preco_unitario')::numeric
  ) then raise exception 'Desconto unitário inválido'; end if;

  select coalesce(jsonb_agg(i || jsonb_build_object(
    'preco_unitario', (i->>'preco_unitario')::numeric - coalesce((i->>'desconto_item')::numeric, 0)
  )), '[]'::jsonb) into v_itens_liquidos
  from jsonb_array_elements(p_itens) i;

  v_resultado := public.finalizar_venda(
    v_itens_liquidos, p_pagamentos, p_pessoa_id, p_desconto, p_observacoes,
    p_deposito_id, p_series, p_vendedor_id, p_vendedor_nome, p_credito_valor,
    p_tipo_entrega, p_endereco_entrega
  );
  v_venda_id := (v_resultado->>'venda_id')::uuid;

  update itens_venda iv set
    preco_unitario = (i.item->>'preco_unitario')::numeric,
    desconto_item = coalesce((i.item->>'desconto_item')::numeric, 0),
    total_item = (i.item->>'quantidade')::numeric *
      ((i.item->>'preco_unitario')::numeric - coalesce((i.item->>'desconto_item')::numeric, 0))
  from jsonb_array_elements(p_itens) i(item)
  where iv.venda_id = v_venda_id and iv.produto_id = i.item->>'produto_id';

  return v_resultado;
end;
$$;

revoke all on function public.finalizar_venda_com_desconto_item(jsonb,jsonb,text,numeric,text,text,jsonb,uuid,text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.finalizar_venda_com_desconto_item(jsonb,jsonb,text,numeric,text,text,jsonb,uuid,text,numeric,text,text) to service_role;

create or replace function public.receber_lancamentos_lote(
  p_alocacoes jsonb, p_forma text, p_conta_id uuid, p_loja_id uuid
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
begin
  if nullif(trim(p_forma), '') is null then raise exception 'Escolha uma forma de pagamento.'; end if;
  if jsonb_array_length(coalesce(p_alocacoes, '[]'::jsonb)) = 0 then raise exception 'Nenhuma dívida selecionada.'; end if;
  if (select count(*) from jsonb_array_elements(p_alocacoes)) <>
     (select count(distinct item->>'id') from jsonb_array_elements(p_alocacoes) item) then
    raise exception 'Dívida repetida no lote.';
  end if;

  for v_aloc in select * from jsonb_array_elements(p_alocacoes) loop
    v_valor := round(coalesce((v_aloc->>'valor')::numeric, 0), 2);
    if v_valor <= 0 then continue; end if;
    select * into v_lanc from lancamentos
      where id = v_aloc->>'id' and tipo = 'receber' and status = 'pendente' for update;
    if not found then raise exception 'Dívida % não está disponível para recebimento.', v_aloc->>'id'; end if;
    if v_valor > round(v_lanc.valor - coalesce(v_lanc.valor_pago, 0), 2) then
      raise exception 'Valor maior que saldo da dívida %.', v_lanc.id;
    end if;
    v_quitado := coalesce(v_lanc.valor_pago, 0) + v_valor >= v_lanc.valor - 0.01;
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

  select id into v_caixa_id from caixas where status = 'aberto' and loja_id = p_loja_id limit 1;
  if v_caixa_id is not null and v_total > 0 then
    insert into movimentos_caixa(caixa_id, tipo, motivo, forma_pagamento, valor)
    values(v_caixa_id, 'recebimento', 'Fiado recebido — lote', p_forma, v_total);
  end if;
  return jsonb_build_object('total', v_total, 'pagamentos', v_resultado);
end;
$$;

revoke all on function public.receber_lancamentos_lote(jsonb,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.receber_lancamentos_lote(jsonb,text,uuid,uuid) to service_role;
