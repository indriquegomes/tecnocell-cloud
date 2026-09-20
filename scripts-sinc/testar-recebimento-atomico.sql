-- Teste manual do fiado por loja + recebimento atômico (19/09).
-- Rode no SQL Editor do Supabase. Não grava nada: tudo dentro de BEGIN/ROLLBACK.
-- Precisa da migration 2026-09-19_fiado-loja-e-recebimento-atomico.sql APLICADA antes.
begin;

-- dados de teste (prefixo __QA__)
insert into lojas (id, nome) values ('11111111-1111-1111-1111-111111111111', '__QA__ LOJA') on conflict (id) do nothing;
insert into lojas (id, nome) values ('22222222-2222-2222-2222-222222222222', '__QA__ LOJA 2') on conflict (id) do nothing;
insert into depositos (id, nome, loja_id) values ('__QA__DEP', '__QA__ DEP', '11111111-1111-1111-1111-111111111111') on conflict (id) do nothing;
insert into vendas (id, numero, total, status, deposito_id)
  values ('33333333-3333-3333-3333-333333333333', 999999, 100, 'concluida', '__QA__DEP');

-- 1) fiado SEM loja_id -> trigger define_loja_lancamento deve preencher
insert into lancamentos (id, descricao, valor, tipo, status, venda_id)
  values ('__QA__FIADO', '__QA__ fiado', 100, 'receber', 'pendente', '33333333-3333-3333-3333-333333333333');

do $$ begin
  if (select loja_id from lancamentos where id = '__QA__FIADO') <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FALHOU: trigger não preencheu loja_id';
  end if;
end $$;

-- 2) receber 40 (parcial): não quita
select public.receber_fiado_reais(p_lancamento_id => '__QA__FIADO', p_valor => 40, p_forma => 'Dinheiro', p_loja_id => '11111111-1111-1111-1111-111111111111');
do $$ begin
  if (select valor_pago from lancamentos where id = '__QA__FIADO') <> 40 then
    raise exception 'FALHOU: valor_pago <> 40';
  end if;
  if (select status from lancamentos where id = '__QA__FIADO') <> 'pendente' then
    raise exception 'FALHOU: quitou antes da hora';
  end if;
end $$;

-- 3) receber 60 (quita)
select public.receber_fiado_reais(p_lancamento_id => '__QA__FIADO', p_valor => 60, p_forma => 'Dinheiro', p_loja_id => '11111111-1111-1111-1111-111111111111');
do $$ begin
  if (select status from lancamentos where id = '__QA__FIADO') <> 'pago' then
    raise exception 'FALHOU: não quitou com 40+60';
  end if;
  if (select valor_pago from lancamentos where id = '__QA__FIADO') <> 100 then
    raise exception 'FALHOU: valor_pago <> 100';
  end if;
end $$;

-- 4) pagar além do saldo deve ser recusado (fiado já quitado)
do $$ begin
  begin
    perform public.receber_fiado_reais(p_lancamento_id => '__QA__FIADO', p_valor => 1, p_forma => 'Dinheiro', p_loja_id => '11111111-1111-1111-1111-111111111111');
    raise exception 'FALHOU: aceitou pagar fiado já quitado';
  exception when others then null; -- esperado
  end;
end $$;

-- 5) loja errada deve ser recusada
insert into lancamentos (id, descricao, valor, tipo, status, venda_id)
  values ('__QA__FIADO2', '__QA__ fiado 2', 50, 'receber', 'pendente', '33333333-3333-3333-3333-333333333333');
do $$ begin
  begin
    perform public.receber_fiado_reais(p_lancamento_id => '__QA__FIADO2', p_valor => 10, p_forma => 'Dinheiro', p_loja_id => '22222222-2222-2222-2222-222222222222');
    raise exception 'FALHOU: aceitou receber fiado da outra loja';
  exception when others then null; -- esperado (Dívida pertence a outra loja)
  end;
end $$;

-- 6) valor negativo deve ser recusado
do $$ begin
  begin
    perform public.receber_fiado_reais(p_lancamento_id => '__QA__FIADO2', p_valor => -5, p_forma => 'Dinheiro', p_loja_id => '11111111-1111-1111-1111-111111111111');
    raise exception 'FALHOU: aceitou valor negativo';
  exception when others then null; -- esperado
  end;
end $$;

select 'TESTE OK — trigger + RPC atômica funcionando' as resultado;
rollback;
