-- LOCAL PGLITE ONLY. Financial fixtures below must never be executed in production.
begin;
do $$
declare c text:='halloween-paid-local'; uid uuid:='00000000-0000-4000-8000-000000000001'; sid uuid:='00000000-0000-4000-8000-000000000002';
 loja_a uuid:=gen_random_uuid();loja_b uuid:=gen_random_uuid();sale_id uuid:=gen_random_uuid();v_os uuid:=gen_random_uuid();ticket_id uuid;token text;s jsonb;r jsonb;count_before integer;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text,true);
 insert into public.lojas values(loja_a,'QA A',true),(loja_b,'QA B',true);
 insert into public.depositos values('qa-deposito',loja_a);insert into public.pessoas values('qa-pessoa','QA Pessoa');
 insert into halloween_private.campaigns(id,title,test_mode,active,stock_confirmed)values(c,'QA pagamento local',false,true,true);
 insert into halloween_private.sale_windows(campaign_id,started_at)values(c,clock_timestamp()-interval '1 hour');
 insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,quantity,remaining,unlimited,enabled)values(c,1,'Cupom QA','percent',15,10000,0,0,true,true);
 insert into public.vendas(id,numero,total,status,created_at,pessoa_id,vendedor_id,deposito_id)values(sale_id,1,200,'concluida',clock_timestamp(),'qa-pessoa',uid,'qa-deposito');
 select to_jsonb(v)into s from public.vendas v where id=sale_id;
 if halloween_private.sale_paid(sale_id)then raise exception 'FAIL sem prova de pagamento';end if;
 insert into public.pagamentos_venda(venda_id,valor,status)values(sale_id,100,'pago'),(sale_id,100,'pendente');
 insert into public.lancamentos(venda_id,tipo,status,valor,valor_pago)values(sale_id,'receber','pago',100,0),(sale_id,'receber','pendente',100,0);
 if halloween_private.capture_sale(c,s,'QA')is not null then raise exception 'FAIL F9 pendente liberou giro';end if;
 update public.lancamentos set status='pago',valor_pago=100 where venda_id=sale_id and status='pendente';
 if not halloween_private.sale_paid(sale_id)then raise exception 'FAIL F9 quitado não reconhecido';end if;
 update halloween_private.campaigns set starts_at=clock_timestamp()+interval '1 hour'where id=c;
 if halloween_private.capture_sale(c,s,'QA')is not null then raise exception 'FAIL antes do início';end if;
 update halloween_private.campaigns set starts_at=null,ends_at=clock_timestamp()-interval '1 second'where id=c;
 if halloween_private.capture_sale(c,s,'QA')is not null then raise exception 'FAIL compra após encerramento';end if;
 update halloween_private.campaigns set ends_at=null where id=c;
 ticket_id:=halloween_private.capture_sale(c,s,'QA');if ticket_id is null then raise exception 'FAIL compra paga sem giro';end if;
 if halloween_private.capture_sale(c,s,'QA')<>ticket_id then raise exception 'FAIL compra duplicou giro';end if;
 if (select loja_id from halloween_private.tickets where id=ticket_id)is distinct from loja_a then raise exception 'FAIL loja da compra';end if;
 select encode(extensions.hmac(convert_to(ticket_id::text,'UTF8'),secret,'sha256'),'hex')into token from halloween_private.campaigns where id=c;
 update halloween_private.campaigns set ends_at=clock_timestamp()-interval '1 second'where id=c;
 r:=public.halloween_spin(token);
 if r->'offer'->>'unlimited_units'<>'true' or r->'offer'->>'loja'<>'QA A'then raise exception 'FAIL escopo/modelo/loja no vale';end if;
 begin perform public.halloween_redeem_at(r->>'code',loja_b);raise exception 'FAIL resgate em outra loja';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 perform public.halloween_redeem_at(r->>'code',loja_a);perform public.halloween_redeem_at(r->>'code',loja_a);
 if (select count(*)from halloween_private.audit where campaign_id=c and action='redeem')<>1 then raise exception 'FAIL resgate duplicado';end if;
 if (select count(*)from public.vendas where id=sale_id)<>1 or (select total from public.vendas where id=sale_id)<>200 or (select count(*)from public.pagamentos_venda where venda_id=sale_id)<>2 then raise exception 'FAIL promoção alterou venda/pagamentos';end if;
 update halloween_private.campaigns set ends_at=null where id=c;
 insert into public.ordens_servico select gen_random_uuid(),3000+g,'qa-pessoa','QA Pessoa',200,'entregue',clock_timestamp()-interval '20 minutes' from generate_series(1,200)g;
 insert into public.ordens_servico values(v_os,777,'qa-pessoa','QA Pessoa',200,'entregue',clock_timestamp());
 insert into public.lancamentos(tipo,status,valor,descricao,pessoa_nome,loja_id)values('receber','pago',200,'Recebimento OS #777','QA Pessoa',loja_a);
 select count(*)into count_before from halloween_private.tickets where campaign_id=c;
 perform halloween_private.sync_sales();perform halloween_private.sync_sales();
 if (select count(*)from halloween_private.tickets where campaign_id=c)<>count_before+1 then raise exception 'FAIL serviço pago não gerou exatamente um giro';end if;
 select t.id into ticket_id from halloween_private.tickets t where t.campaign_id=c and t.os_id=v_os;
 -- Paid candidates must not starve behind an entire batch of unpaid purchases.
 insert into public.vendas(id,numero,total,status,created_at,pessoa_id,vendedor_id,deposito_id)
 select gen_random_uuid(),1000+g,200,'concluida',clock_timestamp()-interval '20 minutes','qa-pessoa',uid,'qa-deposito' from generate_series(1,200)g;
 sale_id:=gen_random_uuid();
 insert into public.vendas(id,numero,total,status,created_at,pessoa_id,vendedor_id,deposito_id)values(sale_id,2001,200,'concluida',clock_timestamp(),'qa-pessoa',uid,'qa-deposito');
 insert into public.pagamentos_venda(venda_id,valor,status)values(sale_id,200,'pago');
 perform halloween_private.sync_sales();perform halloween_private.sync_sales();
 if not exists(select 1 from halloween_private.tickets where campaign_id=c and halloween_private.tickets.sale_id=(select id from public.vendas where numero=2001))then raise exception 'FAIL paid sale starved behind 200 unpaid sales';end if;
 -- Store credit consumed at checkout is settled value, not outstanding F9 debt.
 update public.pagamentos_venda set valor=100 where venda_id=sale_id;
 insert into public.pagamentos_venda(venda_id,valor,status)values(sale_id,100,'vale');
 if not halloween_private.sale_paid(sale_id)then raise exception 'FAIL store credit is paid value';end if;
 update public.lancamentos set status='pendente' where descricao='Recebimento OS #777';
 if halloween_private.sale_valid(ticket_id) is distinct from false then raise exception 'FAIL OS sem comprovação continua válida';end if;
end $$;
select 'PASS local: sem pagamento não emite, F9 pendente bloqueia, quitado emite1, datas, giro após encerramento, mesma loja, resgate único e financeiro preservado' result;
rollback;
