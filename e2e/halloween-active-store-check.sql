-- LOCAL ONLY: synthetic campaign, two stores, and no real financial activity.
begin;
alter table public.perfis add column if not exists lojas_permitidas uuid[];
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
insert into public.lojas(id,nome,ativa) values('eeeeeeee-0000-4000-8000-000000000001','QA Petrópolis',true),('eeeeeeee-0000-4000-8000-000000000002','QA Teresópolis',true);
insert into halloween_private.campaigns(id,title,active,stock_confirmed,test_mode) values('qa-store-scope','QA store scope',false,true,false);
insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,quantity,remaining,unlimited,enabled) values('qa-store-scope',1,'QA desconto','percent',20,10000,0,0,true,true);
insert into halloween_private.tickets(campaign_id,purchase_ref,customer,customer_id,amount_cents,token_hash,expires_at,created_by,loja_id,created_at)
select 'qa-store-scope','QA TERE '||n,'Cliente compartilhado','qa-shared-customer',20000,'qa-store-scope-tere-'||n,now()+interval '48 hours','00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002',now()+n*interval '1 second' from generate_series(1,55)n;
insert into halloween_private.tickets(campaign_id,purchase_ref,customer,customer_id,amount_cents,token_hash,expires_at,created_by,loja_id) values('qa-store-scope','QA PET','Cliente compartilhado','qa-shared-customer',20000,'qa-store-scope-pet',now()+interval '48 hours','00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000001');
insert into halloween_private.coupons(ticket_id,campaign_id,product_id,offer,code,expires_at,redeemed_at)
select id,campaign_id,1,jsonb_build_object('id',1,'name','QA desconto','benefit_type','percent','benefit_value',20),'QA-SCOPE-'||purchase_ref,now()+interval '7 days',case when purchase_ref='QA TERE 1'then now()end from halloween_private.tickets where campaign_id='qa-store-scope'and purchase_ref in('QA PET','QA TERE 1');
update halloween_private.campaigns set active=true where id='qa-store-scope';
insert into public.depositos(id,loja_id)values('qa-store-dep-pet','eeeeeeee-0000-4000-8000-000000000001'),('qa-store-dep-tere','eeeeeeee-0000-4000-8000-000000000002');
insert into public.vendas(id,numero,total,status,created_at,deposito_id)values('eeeeeeee-0000-4000-8000-000000000003',77701,200,'concluida',clock_timestamp(),'qa-store-dep-pet'),('eeeeeeee-0000-4000-8000-000000000004',77702,200,'concluida',clock_timestamp(),'qa-store-dep-tere');
insert into public.pagamentos_venda(venda_id,valor,status)values('eeeeeeee-0000-4000-8000-000000000003',200,'pago'),('eeeeeeee-0000-4000-8000-000000000004',200,'pago');
do $$declare a jsonb;b jsonb;t jsonb;begin
 a:=public.halloween_admin_state_for_store('qa-store-scope','eeeeeeee-0000-4000-8000-000000000001','',0);
 b:=public.halloween_admin_state_for_store('qa-store-scope','eeeeeeee-0000-4000-8000-000000000002','',0);
 if(a#>>'{metrics,tickets}')::int<>1 or(b#>>'{metrics,tickets}')::int<>55 then raise exception 'FAIL contadores misturaram lojas';end if;
 if(a#>>'{clients,0,total}')::int<>1 or(b#>>'{clients,0,total}')::int<>55 then raise exception 'FAIL cliente compartilhado misturou lojas';end if;
 if(a#>>'{metrics,spins}')::int<>1 or(b#>>'{metrics,spins}')::int<>1 or(a#>>'{metrics,redeemed}')::int<>0 or(b#>>'{metrics,redeemed}')::int<>1 then raise exception 'FAIL métricas de resultados/resgates';end if;
 if jsonb_array_length(a->'pending')<>1 or a#>>'{pending,0,numero}'<>'77701' or jsonb_array_length(b->'pending')<>1 or b#>>'{pending,0,numero}'<>'77702' then raise exception 'FAIL vendas pendentes misturadas';end if;
 if has_function_privilege('anon','public.halloween_admin_state_for_store(text,uuid,text,integer)','execute') then raise exception 'FAIL acesso anônimo';end if;
 t:=public.halloween_client_tickets_for_store('qa-store-scope','eeeeeeee-0000-4000-8000-000000000001','qa-shared-customer',0);
 if jsonb_array_length(t)<>1 or t->0->>'purchase_ref'<>'QA PET' then raise exception 'FAIL histórico/paginação misturou lojas';end if;
 t:=public.halloween_client_tickets_for_store('qa-store-scope','eeeeeeee-0000-4000-8000-000000000002','qa-shared-customer',50);
 if jsonb_array_length(t)<>5 then raise exception 'FAIL paginação por loja';end if;
 begin perform public.halloween_admin_state_for_store('qa-store-scope',null,'',0);raise exception 'FAIL loja nula permitida';exception when insufficient_privilege then null;end;
end $$;
update public.perfis set is_master=false,lojas_permitidas=null where id='00000000-0000-4000-8000-000000000001';
select public.halloween_admin_state_for_store('qa-store-scope','eeeeeeee-0000-4000-8000-000000000001','',0)->>'clients_total' as unrestricted_store_count;
update public.perfis set is_master=false,lojas_permitidas=array['eeeeeeee-0000-4000-8000-000000000001'::uuid] where id='00000000-0000-4000-8000-000000000001';
do $$begin
 perform public.halloween_admin_state_for_store('qa-store-scope','eeeeeeee-0000-4000-8000-000000000001','',0);
 begin perform public.halloween_admin_state_for_store('qa-store-scope','eeeeeeee-0000-4000-8000-000000000002','',0);raise exception 'FAIL loja não permitida';exception when insufficient_privilege then null;end;
end $$;
select 'PASS isolamento: mesmo cliente nas duas lojas, contadores, histórico antes da paginação, loja obrigatória e permissão de loja.' result;
rollback;
