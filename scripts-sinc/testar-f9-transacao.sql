-- Executar após a migração, dentro de BEGIN/ROLLBACK. Não confirmar a transação.
do $$
declare
  v_id text; v_loja uuid; v_caixa uuid; v_pago numeric;
  v_op uuid := gen_random_uuid(); v_a jsonb; v_b jsonb; v_mov bigint;
begin
  select l.id, c.loja_id, c.id, coalesce(l.valor_pago,0)
    into v_id, v_loja, v_caixa, v_pago
  from public.lancamentos l join public.caixas c on c.loja_id=l.loja_id
  where l.tipo='receber' and l.status='pendente' and c.status='aberto'
    and l.valor-coalesce(l.valor_pago,0) > 0.03
  order by l.id limit 1;
  if v_id is null then raise exception 'Sem dívida/caixa para verificar F9 com rollback.'; end if;
  select count(*) into v_mov from public.movimentos_caixa where caixa_id=v_caixa;
  v_a := public.receber_lancamentos_lote(jsonb_build_array(jsonb_build_object('id',v_id,'valor',0.01)), 'PIX', null,v_loja,v_op);
  v_b := public.receber_lancamentos_lote(jsonb_build_array(jsonb_build_object('id',v_id,'valor',0.01)), 'PIX', null,v_loja,v_op);
  if v_a is distinct from v_b then raise exception 'Repetição mudou resultado'; end if;
  if (select valor_pago from public.lancamentos where id=v_id) <> v_pago+0.01 then raise exception 'Pagamento duplicado'; end if;
  if (select count(*) from public.movimentos_caixa where caixa_id=v_caixa) <> v_mov+1 then raise exception 'Caixa divergente'; end if;
  begin
    perform public.receber_lancamentos_lote(jsonb_build_array(jsonb_build_object('id',v_id,'valor',0.01),jsonb_build_object('id','zz__QA_INEXISTENTE','valor',0.01)), 'PIX',null,v_loja,gen_random_uuid());
    raise exception 'Lote inválido foi aceito';
  exception when others then
    if SQLERRM not like 'Dívida % não está disponível para recebimento.' then raise; end if;
  end;
  if (select valor_pago from public.lancamentos where id=v_id) <> v_pago+0.01 then raise exception 'Lote deixou pagamento parcial'; end if;
  if (select count(*) from public.movimentos_caixa where caixa_id=v_caixa) <> v_mov+1 then raise exception 'Lote deixou movimento'; end if;
end $$;
