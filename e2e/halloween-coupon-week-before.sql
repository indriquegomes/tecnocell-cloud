-- Fixture exclusiva do banco descartável em memória.
create temporary table qa_coupon_week_before(kind text primary key,coupon_id uuid,old_expiry timestamptz,old_created timestamptz);
do $$declare s text;t jsonb;r jsonb;begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',false);
 update halloween_private.campaigns set active=true,stock_confirmed=true,starts_at=null,ends_at=null where id='halloween-2026-test';
 update halloween_private.products set enabled=(id=1) where campaign_id='halloween-2026-test';
 foreach s in array array['available','redeemed','voided','expired','released','revoked']loop
  t:=public.halloween_issue('halloween-2026-test','__QA__WEEK-'||s,'__QA__ Semana',20000);
  r:=public.halloween_spin(t->>'token');
  update halloween_private.coupons set created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()+interval '47 hours',
    redeemed_at=case when s='redeemed'then clock_timestamp()else null end,
    voided_at=case when s='voided'then clock_timestamp()else null end,
    released_at=case when s='released'then clock_timestamp()else null end where id=(r->>'id')::uuid;
  if s='expired'then update halloween_private.coupons set expires_at=clock_timestamp()-interval '1 second'where id=(r->>'id')::uuid;end if;
  if s='revoked'then update halloween_private.tickets set revoked_at=clock_timestamp()where id=(t->>'id')::uuid;end if;
  insert into qa_coupon_week_before select s,id,expires_at,created_at from halloween_private.coupons where id=(r->>'id')::uuid;
 end loop;
end $$;
