-- Canonical voucher lifetime. Ticket issuance/reissue keeps its existing 48h.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';

-- Take the campaign mutexes BEFORE CREATE TRIGGER takes its table lock.
-- This follows spin's campaign -> coupons order and avoids a deployment deadlock.
do $$begin
 perform 1 from halloween_private.campaigns
 where id in('halloween-2026','halloween-2026-test')order by id for update;
end $$;

-- Enforce on INSERT, including a spin already waiting on the campaign mutex
-- when this migration commits. Do not change an existing voucher on retry.
create or replace function halloween_private.set_coupon_validity()
returns trigger language plpgsql set search_path='' as $$
begin
 new.expires_at:=new.created_at+interval '168 hours';
 return new;
end $$;
revoke all on function halloween_private.set_coupon_validity() from public,anon,authenticated;
create or replace trigger set_coupon_validity before insert on halloween_private.coupons
for each row execute function halloween_private.set_coupon_validity();

-- Same lock order used by spin/redeem/reissue. Only extend live valid vouchers;
-- never resurrect expired/released/replaced/redeemed/revoked benefits.
do $$declare v_now timestamptz;begin
 v_now:=clock_timestamp();
 with candidates as materialized(
  select r.id,r.campaign_id,r.created_at,r.expires_at as before_expiry
  from halloween_private.coupons r
  where r.campaign_id in('halloween-2026','halloween-2026-test')
   and r.redeemed_at is null and r.voided_at is null and r.released_at is null
   and r.expires_at>v_now and r.expires_at<r.created_at+interval '168 hours'
   and halloween_private.sale_valid(r.ticket_id)is true
  for update
 ),changed as(
  update halloween_private.coupons r set expires_at=c.created_at+interval '168 hours'
  from candidates c where r.id=c.id
  returning r.id,r.campaign_id,c.before_expiry,r.expires_at
 )
 insert into halloween_private.audit(campaign_id,action,object_id)
 select campaign_id,'coupon_validity_extended',jsonb_build_object(
  'coupon_id',id,'before',before_expiry,'after',expires_at,
  'source','20261026090000_halloween_coupon_week','checked_at',v_now)::text from changed;
end $$;
commit;
