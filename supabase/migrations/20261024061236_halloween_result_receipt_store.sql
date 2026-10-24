-- Somente apresentação do contato no resultado já autorizado pelo token.
-- Não altera sorteio, prazos, resgate, estoque, financeiro ou grants.
begin;
create or replace function halloween_private.coupon_json(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',r.id,'code',r.code,'offer',r.offer,'created_at',r.created_at,
  'expires_at',r.expires_at,'redeemed_at',r.redeemed_at,
  'pickup_store',case when l.id is not null then jsonb_build_object('name',l.nome,'whatsapp',l.whatsapp)else null end,
  'status',case when r.voided_at is not null then 'replaced'
   when not halloween_private.sale_valid(r.ticket_id)then 'revoked'
   when r.redeemed_at is not null then 'redeemed'
   when r.released_at is not null or r.expires_at<=clock_timestamp()then 'expired'
   else 'available'end)
 from halloween_private.coupons r
 join halloween_private.tickets t on t.id=r.ticket_id
 left join public.lojas l on l.id=t.loja_id
 where r.id=p_id
$$;
commit;
