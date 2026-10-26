do $$declare old record;new_expiry timestamptz;t jsonb;r jsonb;again jsonb;replacement jsonb;begin
 for old in select * from qa_coupon_week_before loop
  select expires_at into strict new_expiry from halloween_private.coupons where id=old.coupon_id;
  if old.kind='available'then
   if new_expiry is distinct from old.old_created+interval '7 days'then raise exception 'FAIL vale disponível não foi ampliado desde o sorteio';end if;
   if not exists(select 1 from halloween_private.audit where action='coupon_validity_extended'and position(old.coupon_id::text in object_id)>0)then raise exception 'FAIL extensão sem auditoria';end if;
  elsif new_expiry is distinct from old.old_expiry then raise exception 'FAIL prazo alterado em vale %',old.kind;end if;
 end loop;
 t:=public.halloween_issue('halloween-2026-test','__QA__WEEK-NEW','__QA__ Semana nova',20000);
 if abs(extract(epoch from((t->>'expires_at')::timestamptz-clock_timestamp()))-172800)>10 then raise exception 'FAIL giro original deixou de durar 48h';end if;
 r:=public.halloween_spin(t->>'token');again:=public.halloween_spin(t->>'token');
 if r->>'code'<>again->>'code' or r->>'expires_at'<>again->>'expires_at'then raise exception 'FAIL retry recriou vale ou renovou prazo';end if;
 if abs(extract(epoch from((r->>'expires_at')::timestamptz-(r->>'created_at')::timestamptz))-604800)>0.001 then raise exception 'FAIL novo vale não dura exatamente sete dias';end if;
 -- After the old 48h boundary the available voucher must remain reserved and redeemable.
 update halloween_private.coupons set created_at=clock_timestamp()-interval '3 days',expires_at=clock_timestamp()+interval '4 days'where id=(r->>'id')::uuid;
 perform halloween_private.release_expired('halloween-2026-test');
 if(select released_at is not null from halloween_private.coupons where id=(r->>'id')::uuid)then raise exception 'FAIL vale de sete dias liberado antes do prazo';end if;
 if (halloween_private.coupon_json((r->>'id')::uuid)->>'status')<>'available'then raise exception 'FAIL vale após 48h não está disponível';end if;
 replacement:=public.halloween_reissue(r->>'code','__QA__ Produto indisponível');
 if abs(extract(epoch from((replacement->>'expires_at')::timestamptz-clock_timestamp()))-172800)>10 then raise exception 'FAIL giro devolvido deixou de durar 48h';end if;
 if(halloween_private.coupon_json((r->>'id')::uuid)->>'status')<>'replaced'then raise exception 'FAIL código anterior continua válido';end if;
 t:=public.halloween_issue('halloween-2026-test','__QA__WEEK-REDEEM','__QA__ Resgate',20000);r:=public.halloween_spin(t->>'token');
 perform public.halloween_redeem(r->>'code');perform public.halloween_redeem(r->>'code');
 if(select count(*)from halloween_private.audit where action='redeem'and object_id=r->>'id')<>1 then raise exception 'FAIL resgate duplicado';end if;
end $$;
do $$declare t jsonb;r uuid:=gen_random_uuid();a uuid:='aaaaaaaa-0000-4000-8000-000000000001';before_global integer;begin
 insert into halloween_private.margin_stores(campaign_id,store_id,unlocked_at,unlocked_margin)values('halloween-2026-test',a,clock_timestamp(),700);
 insert into halloween_private.store_prizes(campaign_id,store_id,slot,name,quantity,remaining,enabled)values('halloween-2026-test',a,12,'__QA__ Brinde sete dias',1,1,true);
 select remaining into before_global from halloween_private.products where campaign_id='halloween-2026-test'and id=12;
 t:=public.halloween_issue('halloween-2026-test','__QA__WEEK-RARE','__QA__ Brinde reservado',20000);
 update halloween_private.tickets set loja_id=a where id=(t->>'id')::uuid;
 insert into halloween_private.coupons(id,ticket_id,campaign_id,product_id,offer,code,created_at,expires_at)
 values(r,(t->>'id')::uuid,'halloween-2026-test',12,'{}','__QA__WEEK-RARE',clock_timestamp()-interval '3 days',clock_timestamp()-interval '1 day');
 perform halloween_private.release_expired('halloween-2026-test');
 if(select remaining from halloween_private.store_prizes where campaign_id='halloween-2026-test'and store_id=a and slot=12)<>0 then raise exception 'FAIL brinde reservado retornou após somente 48h';end if;
 if(select remaining from halloween_private.products where campaign_id='halloween-2026-test'and id=12)is distinct from before_global then raise exception 'FAIL estoque global modificado';end if;
 update halloween_private.coupons set created_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 second'where id=r;
 perform halloween_private.release_expired('halloween-2026-test');perform halloween_private.release_expired('halloween-2026-test');
 if(select remaining from halloween_private.store_prizes where campaign_id='halloween-2026-test'and store_id=a and slot=12)<>1 then raise exception 'FAIL retorno do brinde vencido não foi único';end if;
end $$;
select 'PASS vale novo 7 dias, extensão auditada só dos disponíveis, estados antigos preservados, retry e giros 48h' result;
