update halloween_private.campaigns set active=true,starts_at=clock_timestamp()-interval '1 day',ends_at=clock_timestamp()+interval '1 day'where id='halloween-2026';
insert into public.produtos values('auto-p','Auto','03535',true,1000,150.01),('auto-q','Pending','12451',true,1000,null);
insert into public.lojas(id,nome,ativa)values('aaaaaaaa-0000-4000-8000-000000000001','Auto A',true),('aaaaaaaa-0000-4000-8000-000000000002','Auto B',true);
insert into public.depositos values('auto-a','aaaaaaaa-0000-4000-8000-000000000001'),('auto-b','aaaaaaaa-0000-4000-8000-000000000002');
do $$declare a jsonb;b jsonb; cnt integer; bad boolean:=false;begin
 a:=public.finalizar_venda_halloween('[{"produto_id":"auto-p","quantidade":1,"preco_unitario":1000,"desconto_item":150,"halloween_rule_id":"halloween-2026:1","halloween_version":1}]','[{"valor":850}]',null,0,null,'auto-a','[]',null,null,0,'retirada',null,'aaaaaaaa-0000-4000-8000-000000000003',null);
 b:=public.finalizar_venda_halloween('[{"produto_id":"auto-p","quantidade":1,"preco_unitario":1000,"desconto_item":150,"halloween_rule_id":"halloween-2026:1","halloween_version":1}]','[{"valor":850}]',null,0,null,'auto-a','[]',null,null,0,'retirada',null,'aaaaaaaa-0000-4000-8000-000000000003',null);
 if (a->>'venda_id')is distinct from(b->>'venda_id') or b->>'jaExistia'is distinct from'true'or(select count(*)from public.vendas where id=(a->>'venda_id')::uuid)<>1 then raise exception 'retry';end if;
 perform halloween_private.margin_reconcile('halloween-2026');
 if exists(select 1 from halloween_private.margin_stores where unlocked_at is not null)then raise exception '699.99 unlocked';end if;
 update public.produtos set preco_custo=150 where id='auto-p';
 perform public.finalizar_venda_halloween('[{"produto_id":"auto-p","quantidade":1,"preco_unitario":1000,"desconto_item":150,"halloween_rule_id":"halloween-2026:1","halloween_version":1}]','[{"valor":850}]',null,0,null,'auto-b','[]',null,null,0,'retirada',null,gen_random_uuid(),null);
 perform halloween_private.margin_reconcile('halloween-2026');
 if not exists(select 1 from halloween_private.margin_stores where store_id='aaaaaaaa-0000-4000-8000-000000000002'and total=700 and unlocked_at is not null)then raise exception '700 not unlocked';end if;
 if exists(select 1 from halloween_private.draw_pool_for('halloween-2026','{}',null)where product_id in(12,13))then raise exception 'unknown store rare';end if;
 update public.vendas set status='cancelada'where deposito_id='auto-b';perform halloween_private.margin_reconcile('halloween-2026');
 if not exists(select 1 from halloween_private.margin_stores where store_id='aaaaaaaa-0000-4000-8000-000000000002'and total=0 and unlocked_at is not null)then raise exception 'relocked';end if;
 insert into public.devolucoes(id,venda_id,status,valor_total)values('bbbbbbbb-0000-4000-8000-000000000001',(a->>'venda_id')::uuid,'concluida',425);
 insert into public.itens_devolucao values('bbbbbbbb-0000-4000-8000-000000000001','auto-p',0.5);
 perform halloween_private.margin_reconcile('halloween-2026');
 if(select total from halloween_private.margin_stores where store_id='aaaaaaaa-0000-4000-8000-000000000001')<>350 then raise exception 'partial refund cents';end if;
 select count(*)into cnt from public.vendas;
 begin perform public.finalizar_venda_halloween('[{"produto_id":"auto-p","quantidade":1,"preco_unitario":1,"desconto_item":0.15,"halloween_rule_id":"halloween-2026:1","halloween_version":1}]','[]',null,0,null,'auto-a','[]',null,null,0,'retirada',null,gen_random_uuid(),null);exception when others then bad:=true;end;
 if not bad or(select count(*)from public.vendas)<>cnt then raise exception 'forged price persisted';end if;
 perform public.finalizar_venda_halloween('[{"produto_id":"auto-q","quantidade":1,"preco_unitario":1000,"desconto_item":200,"halloween_rule_id":"halloween-2026:2","halloween_version":1}]','[{"valor":800}]',null,0,null,'auto-a','[]',null,null,0,'retirada',null,gen_random_uuid(),null);
 perform halloween_private.margin_reconcile('halloween-2026');
 if(select pending from halloween_private.margin_stores where store_id='aaaaaaaa-0000-4000-8000-000000000001')<>1 then raise exception 'missing cost not pending';end if;
 if has_function_privilege('anon','public.halloween_margin_state(text,uuid,date,date,text)','execute')or has_function_privilege('authenticated','public.finalizar_venda_halloween(jsonb,jsonb,text,numeric,text,text,jsonb,uuid,text,numeric,text,text,uuid,text)','execute')then raise exception 'public ACL';end if;
end $$;
select 'PASS auto margin retry, 699.99/700 per store, latch, partial refund cents, forged price, pending cost, unknown store and ACL' result;

-- Actual current return RPC is loaded verbatim by the runner.
do $$declare sale uuid;r jsonb;req jsonb;op uuid:=gen_random_uuid();actor uuid:='00000000-0000-4000-8000-000000000001';begin
 insert into public.produtos values('mixed-other','Other','other',true,100,10);
 req:=jsonb_build_array('[{"produto_id":"auto-p","quantidade":1,"preco_unitario":1000,"desconto_item":150,"halloween_rule_id":"halloween-2026:1","halloween_version":1},{"produto_id":"mixed-other","quantidade":3,"preco_unitario":100,"desconto_item":0,"promotion_discount_total":20}]'::jsonb,'[{"valor":1130,"taxa":7}]'::jsonb,null,20,null,'auto-a','[]'::jsonb,actor,'Operator',0,'retirada',null,null);
 r:=public.finalizar_venda_halloween(req->0,req->1,null,20,null,'auto-a','[]',actor,'Operator',0,'retirada',null,op,null);sale:=(r->>'venda_id')::uuid;
 if (select total from public.vendas where id=sale)<>1137 or(select desconto from public.vendas where id=sale)<>0 or(select total_item from public.itens_venda where venda_id=sale and produto_id='mixed-other')<>280 then raise exception 'mixed/taxa total';end if;
 if public.halloween_margin_replay(op,actor,req)->>'jaExistia'is distinct from 'true'then raise exception 'replay';end if;
 begin perform public.halloween_margin_replay(op,'00000000-0000-4000-8000-000000000003',req);raise exception 'wrong actor accepted';exception when raise_exception then if sqlerrm='wrong actor accepted'then raise;end if;end;
 r:=public.registrar_devolucao(sale,'auto-a',null,null,null,'test','sem_reembolso','[{"produto_id":"auto-p","nome":"Auto","quantidade":1,"status_produto":"defeito"}]',false);
 if (select valor_total from public.devolucoes where id=(r->>'devolucao_id')::uuid)<>850 then raise exception 'real refund diluted Halloween';end if;
 r:=public.registrar_devolucao(sale,'auto-a',null,null,null,'test','sem_reembolso','[{"produto_id":"mixed-other","nome":"Other","quantidade":3,"status_produto":"defeito"}]',false);
 if (select valor_total from public.devolucoes where id=(r->>'devolucao_id')::uuid)<>280 then raise exception 'real refund rounded per-unit wrongly';end if;
end $$;
select 'PASS actual registrar_devolucao: mixed cart exact own-line promo, quantity3 fractional unit discount, positive fee, actor-bound replay' result;
do $$declare j jsonb;begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 j:=public.halloween_margin_state('halloween-2026');
 if not exists(select 1 from jsonb_array_elements(j->'products')x where x->>'product_id'='auto-q'and x->'cost'='null'::jsonb and x->'margin'='null'::jsonb)then raise exception 'pending aggregate hidden';end if;
 insert into public.tabelas_preco values('eeeeeeee-0000-4000-8000-000000000001',true,false);
 insert into public.itens_tabela_preco values('eeeeeeee-0000-4000-8000-000000000001','auto-p',null,900);
 perform public.finalizar_venda_halloween('[{"produto_id":"auto-p","quantidade":1,"preco_unitario":900,"desconto_item":135,"halloween_rule_id":"halloween-2026:1","halloween_version":1}]','[{"valor":765}]',null,0,null,'auto-a','[]',null,null,0,'retirada',null,gen_random_uuid(),'eeeeeeee-0000-4000-8000-000000000001');
 if has_function_privilege('anon','public.halloween_margin_replay(uuid,uuid,jsonb)','execute')or has_function_privilege('authenticated','public.halloween_margin_replay(uuid,uuid,jsonb)','execute')then raise exception 'replay ACL';end if;
end $$;
select 'PASS pending aggregates NULL, NULL quantity tier defaults1, replay service-only' result;
