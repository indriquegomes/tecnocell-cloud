-- Teste manual da RPC receber_fiados_vale (v2, com loja) — rode NO SQL Editor.
-- Fica em BEGIN/ROLLBACK: nada é confirmado. Cria lojas/clientes/fiados __QA__.
-- Cobre: total, parcial, lote, saldo insuficiente, idempotência (clique duplo),
-- outro cliente, OUTRA LOJA, fiado pago, sem cliente, over-payment e rollback.

begin;

do $$
declare
  v_loja uuid := gen_random_uuid();
  v_loja2 uuid := gen_random_uuid();
  p_a text := '__QA_vale_a_' || substr(md5(random()::text),1,8);
  p_b text := '__QA_vale_b_' || substr(md5(random()::text),1,8);
  l_total text; l_parc text; l_lote1 text; l_lote2 text;
  l_over text; l_insuf text; l_outro text; l_semcli text; l_pago text; l_outraloja text;
  op uuid; r numeric;
begin
  insert into lojas (id, nome) values (v_loja, '__QA Loja Vale'), (v_loja2, '__QA Loja Vale 2');

  insert into pessoas (id, nome, tipo) values (p_a, '__QA Vale A', 'cliente'), (p_b, '__QA Vale B', 'cliente');
  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, loja_id)
    values (p_a, '__QA Vale A', 500, 'credito', '__QA teste', v_loja);
  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, loja_id)
    values (p_b, '__QA Vale B', 10, 'credito', '__QA teste', v_loja);

  l_total := '__QA_l1_' || substr(md5(random()::text),1,8);
  l_parc  := '__QA_l2_' || substr(md5(random()::text),1,8);
  l_lote1 := '__QA_l3_' || substr(md5(random()::text),1,8);
  l_lote2 := '__QA_l4_' || substr(md5(random()::text),1,8);
  l_over  := '__QA_l5_' || substr(md5(random()::text),1,8);
  l_insuf := '__QA_l6_' || substr(md5(random()::text),1,8);
  insert into lancamentos (id, descricao, valor, tipo, status, valor_pago, pessoa_id, pessoa_nome, loja_id, data_vencimento) values
    (l_total, '__QA total', 100, 'receber', 'pendente', 0, p_a, '__QA Vale A', v_loja, '2026-01-01'),
    (l_parc,  '__QA parcial', 60, 'receber', 'pendente', 0, p_a, '__QA Vale A', v_loja, '2026-02-01'),
    (l_lote1, '__QA lote1', 50, 'receber', 'pendente', 0, p_a, '__QA Vale A', v_loja, '2026-03-01'),
    (l_lote2, '__QA lote2', 40, 'receber', 'pendente', 0, p_a, '__QA Vale A', v_loja, '2026-04-01'),
    (l_over,  '__QA overpay', 20, 'receber', 'pendente', 0, p_a, '__QA Vale A', v_loja, '2026-05-01'),
    (l_insuf, '__QA insuf', 1000, 'receber', 'pendente', 0, p_a, '__QA Vale A', v_loja, '2026-06-01');

  l_outro := '__QA_l7_' || substr(md5(random()::text),1,8);
  insert into lancamentos (id, descricao, valor, tipo, status, valor_pago, pessoa_id, pessoa_nome, loja_id) values
    (l_outro, '__QA outro cliente', 50, 'receber', 'pendente', 0, p_b, '__QA Vale B', v_loja);

  l_outraloja := '__QA_l10_' || substr(md5(random()::text),1,8);
  insert into lancamentos (id, descricao, valor, tipo, status, valor_pago, pessoa_id, pessoa_nome, loja_id) values
    (l_outraloja, '__QA outra loja', 30, 'receber', 'pendente', 0, p_a, '__QA Vale A', v_loja2);

  l_semcli := '__QA_l8_' || substr(md5(random()::text),1,8);
  insert into lancamentos (id, descricao, valor, tipo, status, valor_pago, pessoa_nome, loja_id) values
    (l_semcli, '__QA sem cliente', 30, 'receber', 'pendente', 0, '__QA Sem Cliente', v_loja);

  l_pago := '__QA_l9_' || substr(md5(random()::text),1,8);
  insert into lancamentos (id, descricao, valor, tipo, status, valor_pago, pessoa_id, pessoa_nome, loja_id) values
    (l_pago, '__QA pago', 25, 'receber', 'pago', 25, p_a, '__QA Vale A', v_loja);

  -- 1) TOTAL
  op := gen_random_uuid();
  perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_total, 'valor', 100)), op, v_loja, '__QA teste');
  if (select status from lancamentos where id = l_total) <> 'pago' then raise exception 'TOTAL: não quitou'; end if;

  -- 2) PARCIAL
  op := gen_random_uuid();
  perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_parc, 'valor', 30)), op, v_loja, '__QA teste');
  if (select valor_pago from lancamentos where id = l_parc) <> 30 then raise exception 'PARCIAL: valor_pago errado'; end if;

  -- 3) LOTE
  op := gen_random_uuid();
  perform public.receber_fiados_vale(p_a, jsonb_build_array(
    jsonb_build_object('id', l_lote1, 'valor', 25),
    jsonb_build_object('id', l_lote2, 'valor', 15)
  ), op, v_loja, '__QA teste');
  if (select valor_pago from lancamentos where id = l_lote1) <> 25 then raise exception 'LOTE: lote1 errado'; end if;
  if (select valor_pago from lancamentos where id = l_lote2) <> 15 then raise exception 'LOTE: lote2 errado'; end if;

  -- 4) IDEMPOTÊNCIA
  op := gen_random_uuid();
  perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_lote2, 'valor', 10)), op, v_loja, '__QA teste');
  perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_lote2, 'valor', 10)), op, v_loja, '__QA teste');
  if (select valor_pago from lancamentos where id = l_lote2) <> 25 then raise exception 'IDEMP: duplicou'; end if;

  -- 5) SALDO INSUFICIENTE
  begin
    perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_insuf, 'valor', 1000)), gen_random_uuid(), v_loja, '__QA teste');
    raise exception 'SALDO INSUFICIENTE: não recusou';
  exception when others then
    if SQLERRM not like 'Saldo de crédito insuficiente nesta loja%' then raise; end if;
  end;
  if (select valor_pago from lancamentos where id = l_insuf) <> 0 then raise exception 'SALDO INSUFICIENTE: pagou'; end if;

  -- 6) OVER-PAYMENT
  begin
    perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_over, 'valor', 30)), gen_random_uuid(), v_loja, '__QA teste');
    raise exception 'OVERPAY: não recusou';
  exception when others then
    if SQLERRM not like 'Valor maior que saldo da dívida%' then raise; end if;
  end;

  -- 7) OUTRO CLIENTE
  begin
    perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_outro, 'valor', 10)), gen_random_uuid(), v_loja, '__QA teste');
    raise exception 'OUTRO CLIENTE: não recusou';
  exception when others then
    if SQLERRM not like 'Fiado % pertence a outro cliente.' then raise; end if;
  end;

  -- 8) OUTRA LOJA
  begin
    perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_outraloja, 'valor', 10)), gen_random_uuid(), v_loja, '__QA teste');
    raise exception 'OUTRA LOJA: não recusou';
  exception when others then
    if SQLERRM not like 'Fiado % pertence a outra loja%' then raise; end if;
  end;

  -- 9) FIADO PAGO
  begin
    perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_pago, 'valor', 1)), gen_random_uuid(), v_loja, '__QA teste');
    raise exception 'FIADO PAGO: não recusou';
  exception when others then
    if SQLERRM not like 'Dívida % não está disponível para recebimento com vale.' then raise; end if;
  end;

  -- 10) SEM CLIENTE
  begin
    perform public.receber_fiados_vale(p_a, jsonb_build_array(jsonb_build_object('id', l_semcli, 'valor', 10)), gen_random_uuid(), v_loja, '__QA teste');
    raise exception 'SEM CLIENTE: não recusou';
  exception when others then
    if SQLERRM not like 'Fiado % não tem cliente identificado para usar vale-crédito.' then raise; end if;
  end;

  -- 11) ROLLBACK TOTAL (1ª válida + 2ª inválida)
  begin
    perform public.receber_fiados_vale(p_a, jsonb_build_array(
      jsonb_build_object('id', l_over, 'valor', 10),
      jsonb_build_object('id', l_outro, 'valor', 5)
    ), gen_random_uuid(), v_loja, '__QA teste');
    raise exception 'ROLLBACK: lote inválido aceito';
  exception when others then
    if SQLERRM not like 'Fiado % pertence a outro cliente.' then raise; end if;
  end;
  if (select valor_pago from lancamentos where id = l_over) <> 0 then raise exception 'ROLLBACK: 1ª alterada'; end if;

  -- 12) uso gravado com lancamento_id + loja_id + saldo coerente
  if (select count(*) from creditos_clientes where pessoa_id = p_a and tipo = 'uso' and lancamento_id is not null and loja_id = v_loja) <> 5 then
    raise exception 'USO: vínculo/loja ausente';
  end if;
  select coalesce(sum(case when tipo in ('uso','estorno') then -valor else valor end),0)
    into r from creditos_clientes where pessoa_id = p_a and loja_id = v_loja;
  if r::numeric <> 500 - 100 - 30 - 40 - 10 then raise exception 'SALDO FINAL: incoerente (%)', r; end if;

  raise notice '✅ receber_fiados_vale (com loja): todos os cenários passaram.';
end $$;

rollback;
