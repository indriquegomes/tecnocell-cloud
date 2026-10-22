-- Synthetic campaign-only records; no sale, till, payment or ERP stock is created.
begin;
do $$
declare c text:='halloween-auto-check'; s jsonb; a uuid; b uuid; v_token text; r jsonb; d jsonb; v_user uuid; v_session uuid;
begin
 select x.user_id,x.id into v_user,v_session from auth.sessions x join halloween_private.staff h on h.user_id=x.user_id join public.perfis p on p.id=x.user_id where h.enabled and p.ativo is distinct from false and (x.not_after is null or x.not_after>clock_timestamp()) limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'session_id',v_session,'role','authenticated')::text,true);
 insert into halloween_private.campaigns(id,title,test_mode,active,stock_confirmed) values(c,'Synthetic automatic QA',true,true,true);
 insert into halloween_private.sale_windows(campaign_id,started_at) values(c,clock_timestamp()-interval '1 hour');
 insert into halloween_private.products values(c,1,'QA','percent',15,1,2,2);
 s:=jsonb_build_object('id',gen_random_uuid(),'created_at',clock_timestamp(),'status','concluida','total',200,'pessoa_id','QA-CUSTOMER');
 a:=halloween_private.capture_sale(c,s,'Cliente QA');
 if a is null or halloween_private.capture_sale(c,s,'Cliente QA')<>a then raise exception 'FAIL: automatic issue/idempotency'; end if;
 if halloween_private.capture_sale(c,s||jsonb_build_object('id',gen_random_uuid(),'total',199.99),'QA') is not null then raise exception 'FAIL: minimum'; end if;
 if halloween_private.capture_sale(c,s||jsonb_build_object('id',gen_random_uuid(),'pessoa_id',null),'QA') is not null then raise exception 'FAIL: unidentified'; end if;
 if halloween_private.capture_sale(c,s||jsonb_build_object('id',gen_random_uuid(),'created_at',clock_timestamp()-interval '2 hours'),'QA') is not null then raise exception 'FAIL: retroactive'; end if;
 if halloween_private.capture_sale(c,s||jsonb_build_object('id',gen_random_uuid(),'status','cancelada'),'QA') is not null then raise exception 'FAIL: canceled'; end if;
 if halloween_private.capture_sale(c,s||jsonb_build_object('id',gen_random_uuid(),'uso_interno',true),'QA') is not null then raise exception 'FAIL: internal'; end if;
 b:=halloween_private.capture_sale(c,s||jsonb_build_object('id',gen_random_uuid(),'total',400),'Cliente QA');
 if b is null or b=a or (select count(*) from halloween_private.tickets where campaign_id=c)<>2 then raise exception 'FAIL: one per purchase'; end if;
 select encode(extensions.hmac(convert_to(a::text,'UTF8'),secret,'sha256'),'hex') into v_token from halloween_private.campaigns where id=c;
 r:=public.halloween_spin(v_token);
 d:=public.halloween_admin_state(c);
 if (d->'clients'->0->>'available')::integer<>1 or (d->'clients'->0->>'used')::integer<>1 or jsonb_array_length(d->'clients')<>1 then raise exception 'FAIL: grouping'; end if;
 d:=public.halloween_client_tickets(c,'QA-CUSTOMER',0);
 if jsonb_array_length(d)<>2 or not exists(select 1 from jsonb_array_elements(d)x where x->>'token'=v_token and x->'result'->>'code'=r->>'code') then raise exception 'FAIL: history/recovery'; end if;
 update halloween_private.tickets set revoked_at=clock_timestamp() where id=a;
 begin perform public.halloween_redeem(r->>'code');raise exception 'FAIL: revoked redeem';exception when others then if sqlerrm like 'FAIL:%' then raise;end if;end;
 if (public.halloween_ticket(v_token)->>'status')<>'revoked' or (halloween_private.coupon_json((r->>'id')::uuid)->>'status')<>'revoked' then raise exception 'FAIL: canceled status';end if;
 begin perform public.halloween_spin(v_token);raise exception 'FAIL: revoked spin';exception when others then if sqlerrm like 'FAIL:%' then raise;end if;end;
 -- Exercise the real worker's read/cancellation path against nonexistent synthetic sale IDs.
 -- No real sale row is created or changed. Missing source sales invalidate the QA tickets.
 update halloween_private.campaigns set test_mode=false where id=c;
 perform halloween_private.sync_sales(); perform halloween_private.sync_sales();
 if (select sync_error from halloween_private.campaigns where id=c) is not null then raise exception 'FAIL: worker query';end if;
 if (select remaining from halloween_private.products where campaign_id=c and id=1)<>2 then raise exception 'FAIL: cancellation reservation returned twice';end if;
 update halloween_private.campaigns set test_mode=true where id=c;
 update halloween_private.tickets set revoked_at=null where id=b;
 select encode(extensions.hmac(convert_to(b::text,'UTF8'),secret,'sha256'),'hex') into v_token from halloween_private.campaigns where id=c;
 r:=public.halloween_spin(v_token);
 update halloween_private.coupons set expires_at=clock_timestamp()-interval '1 second' where id=(r->>'id')::uuid;
 perform halloween_private.release_expired(c);
 update halloween_private.campaigns set test_mode=false where id=c;
 perform halloween_private.sync_sales();
 if (select remaining from halloween_private.products where campaign_id=c and id=1)<>2 then raise exception 'FAIL: expiration then cancellation double return';end if;
 update halloween_private.campaigns set test_mode=true where id=c;
 a:=halloween_private.capture_sale(c,s||jsonb_build_object('id',gen_random_uuid()),'Cliente QA');
 select encode(extensions.hmac(convert_to(a::text,'UTF8'),secret,'sha256'),'hex') into v_token from halloween_private.campaigns where id=c;
 r:=public.halloween_spin(v_token);perform public.halloween_redeem(r->>'code');
 update halloween_private.campaigns set test_mode=false where id=c;
 perform halloween_private.sync_sales();
 if (select remaining from halloween_private.products where campaign_id=c and id=1)<>1 or not exists(select 1 from halloween_private.coupons where id=(r->>'id')::uuid and redeemed_at is not null and released_at is null) then raise exception 'FAIL: cancellation after redemption';end if;
 update halloween_private.campaigns set active=false where id=c;
 if halloween_private.capture_sale(c,s||jsonb_build_object('id',gen_random_uuid()),'QA') is not null then raise exception 'FAIL: paused';end if;
 if has_function_privilege('anon','halloween_private.capture_sale(text,jsonb,text)','execute') or has_function_privilege('authenticated','halloween_private.sync_sales()','execute') then raise exception 'FAIL: worker public';end if;
 raise notice 'PASS: automatic capture, one per sale, minimum, customer, retroactivity, cancellation, grouping, token recovery and private worker';
end $$;
select 'PASS: automatic campaign tests; all records rolled back' result;
rollback;
