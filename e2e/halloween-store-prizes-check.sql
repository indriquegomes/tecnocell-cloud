do $$declare c text:='halloween-2026';a uuid:='aaaaaaaa-0000-4000-8000-000000000001';b uuid:='aaaaaaaa-0000-4000-8000-000000000002';tid uuid:=gen_random_uuid();cid uuid:=gen_random_uuid();tid2 uuid:=gen_random_uuid();cid2 uuid:=gen_random_uuid();before_global integer;replacement jsonb;again jsonb;begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 if exists(select 1 from halloween_private.store_prizes where quantity<>0 or remaining<>0 or enabled)then raise exception 'phantom stock';end if;
 if not exists(select 1 from halloween_private.store_prizes where store_id=b and slot=13 and code='12151'and name like '%YX-A34%')then raise exception 'Teres catalog';end if;
 perform public.halloween_configure_store_prize(c,a,12,1,true);perform public.halloween_configure_store_prize(c,b,12,1,true);
 update halloween_private.margin_stores set unlocked_at=clock_timestamp(),unlocked_margin=700 where campaign_id=c and store_id in(a,b);
 if (select chance_bps from halloween_private.draw_pool_for(c,'{}',b)where product_id=12)<>50 then raise exception 'rare bps';end if;
 select remaining into before_global from halloween_private.products where campaign_id=c and id=12;
 insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,customer_id,amount_cents,token_hash,expires_at,created_by,loja_id)values(tid,c,'storetest1','Test','test',20000,tid::text,clock_timestamp()+interval '1 day','00000000-0000-4000-8000-000000000001',b),(tid2,c,'storetest2','Test','test',20000,tid2::text,clock_timestamp()+interval '1 day','00000000-0000-4000-8000-000000000001',a);
 insert into halloween_private.coupons(id,ticket_id,campaign_id,product_id,offer,code,expires_at)values(cid,tid,c,12,'{}','STORE-TER',clock_timestamp()+interval '1 day');
 if(select offer->>'name'from halloween_private.coupons where id=cid)not like '%YX-6028%'or(select remaining from halloween_private.store_prizes where campaign_id=c and store_id=b and slot=12)<>0 or(select remaining from halloween_private.store_prizes where campaign_id=c and store_id=a and slot=12)<>1 then raise exception 'crossstore reservation';end if;
 insert into halloween_private.coupons(id,ticket_id,campaign_id,product_id,offer,code,expires_at)values(cid2,tid2,c,12,'{}','STORE-PET',clock_timestamp()+interval '1 day');
 if(select offer->>'name'from halloween_private.coupons where id=cid2)like '%YX-6028%'then raise exception 'Pet prize changed';end if;
 update halloween_private.coupons set expires_at=clock_timestamp()-interval '1 second'where id=cid;
 perform halloween_private.release_expired(c);perform halloween_private.release_expired(c);
 if(select remaining from halloween_private.store_prizes where campaign_id=c and store_id=b and slot=12)<>1 or(select remaining from halloween_private.products where campaign_id=c and id=12)<>before_global then raise exception 'expiry global/double return';end if;
 update halloween_private.campaigns set test_mode=true where id=c;
 replacement:=public.halloween_reissue('STORE-PET','Teste de reemissão por loja');
 again:=public.halloween_reissue('STORE-PET','Teste de reemissão por loja');
 if replacement->>'id'is distinct from again->>'id'or(select remaining from halloween_private.store_prizes where campaign_id=c and store_id=a and slot=12)<>1 then raise exception 'reissue double/cross return';end if;
 if exists(select 1 from jsonb_array_elements(public.halloween_ticket(replacement->>'token')->'campaign'->'products')x where x<>jsonb_build_object('id',x->'id'))then raise exception 'ticket surprise leak';end if;
 -- Payment invalidation also returns the original store allocation once.
 insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,amount_cents,token_hash,expires_at,created_by,loja_id)values('dddddddd-0000-4000-8000-000000000001',c,'invalidated-store','Test',20000,'invalidated-store',clock_timestamp()+interval '1 day','00000000-0000-4000-8000-000000000001',b);
 insert into halloween_private.coupons(ticket_id,campaign_id,product_id,offer,code,expires_at)values('dddddddd-0000-4000-8000-000000000001',c,12,'{}','STORE-CANCEL',clock_timestamp()+interval '1 day');
 update halloween_private.campaigns set test_mode=false where id=c;
 perform halloween_private.sync_sales();perform halloween_private.sync_sales();
 if(select remaining from halloween_private.store_prizes where campaign_id=c and store_id=b and slot=12)<>1 or(select remaining from halloween_private.products where campaign_id=c and id=12)<>before_global then raise exception 'sync invalidation global/double return';end if;
 -- The public catalog reveals only slot IDs, with no prize or money data.
 if exists(select 1 from jsonb_array_elements(public.halloween_catalog(c)->'products')x where x<>jsonb_build_object('id',x->'id'))then raise exception 'surprise leak';end if;
 if has_table_privilege('anon','halloween_private.store_prizes','select')or has_function_privilege('anon','public.halloween_store_prizes_state(text)','execute')then raise exception 'stock ACL';end if;
end $$;
select 'PASS store prize zero default, Teres catalog, isolated reservations, 0.5%, expiry exactly once, original global inventory preserved, surprise and ACL' result;
-- Deterministic random source exists only inside this isolated test transaction.
do $test$declare saved text;tid uuid:=gen_random_uuid();token text;won jsonb;g integer;begin
 saved:=pg_get_functiondef('extensions.gen_random_bytes(integer)'::regprocedure);
 execute $override$create or replace function extensions.gen_random_bytes(integer)returns bytea language sql volatile as 'select decode(repeat(''ff'',$1),''hex'')'$override$;
 update halloween_private.campaigns set test_mode=true,active=true where id='halloween-2026';
 update halloween_private.store_prizes set quantity=1,remaining=1,enabled=true where campaign_id='halloween-2026'and store_id='aaaaaaaa-0000-4000-8000-000000000002'and slot=13;
 select remaining into g from halloween_private.products where campaign_id='halloween-2026'and id=13;
 select encode(extensions.hmac(convert_to(tid::text,'UTF8'),secret,'sha256'),'hex')into token from halloween_private.campaigns where id='halloween-2026';
 insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,amount_cents,token_hash,expires_at,created_by,loja_id)values(tid,'halloween-2026',tid::text,'Real spin',20000,encode(extensions.digest(token,'sha256'),'hex'),clock_timestamp()+interval '1 day','00000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002');
 won:=public.halloween_spin(token);
 if won->'offer'->>'name'not like '%YX-A34%'or(select remaining from halloween_private.store_prizes where campaign_id='halloween-2026'and store_id='aaaaaaaa-0000-4000-8000-000000000002'and slot=13)<>0 or(select remaining from halloween_private.products where campaign_id='halloween-2026'and id=13)<>g then raise exception 'real spin wrong store/globalstock';end if;
 if public.halloween_spin(token)<>won then raise exception 'real spin retry changed';end if;
 execute saved;
exception when others then if saved is not null then execute saved;end if;raise;
end $test$;
select 'PASS actual deterministic spin: Teres YX-A34 offer, original global untouched, local reserve one, immutable retry' result;
