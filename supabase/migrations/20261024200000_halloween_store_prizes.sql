-- Separate, physically confirmed allocations. Existing global quantities are never copied.
begin;
set local lock_timeout='3s';
create table halloween_private.store_prizes(campaign_id text not null references halloween_private.campaigns(id),store_id uuid not null references public.lojas(id),slot integer not null check(slot in(12,13)),code text,name text not null,quantity integer not null default 0 check(quantity>=0),remaining integer not null default 0 check(remaining between 0 and quantity),enabled boolean not null default false,primary key(campaign_id,store_id,slot));
create table halloween_private.store_reservations(coupon_id uuid primary key references halloween_private.coupons(id),campaign_id text not null,store_id uuid not null,slot integer not null,released_at timestamptz,foreign key(campaign_id,store_id,slot)references halloween_private.store_prizes(campaign_id,store_id,slot));
-- Canonical ERP store IDs resolved from unique store names; never supplied by public URLs.
insert into halloween_private.store_prizes(campaign_id,store_id,slot,code,name)
select c.id,l.id,p.id,case when lower(l.nome)like '%teres%'then case p.id when 12 then '05090'else '12151'end else null end,
case when lower(l.nome)like '%teres%'then case p.id when 12 then 'KIT CHAVE YAXUN COMPLETO YX-6028'else 'VENTOSA COMPLETA PROFISSIONAL YAXUN YX-A34'end else p.name end
from halloween_private.campaigns c join halloween_private.products p on p.campaign_id=c.id and p.id in(12,13)cross join public.lojas l
where c.id='halloween-2026'and (lower(l.nome)like '%teres%'or lower(l.nome)like '%petr%');
create function public.halloween_store_prizes_state(p_campaign text)returns jsonb language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
begin perform halloween_private.require_staff();return(select coalesce(jsonb_agg(jsonb_build_object('store_id',s.store_id,'store_name',l.nome,'slot',s.slot,'code',s.code,'name',s.name,'quantity',s.quantity,'remaining',s.remaining,'enabled',s.enabled)order by l.nome,s.slot),'[]')from halloween_private.store_prizes s join public.lojas l on l.id=s.store_id where s.campaign_id=p_campaign);end $$;
create function public.halloween_configure_store_prize(p_campaign text,p_store uuid,p_slot integer,p_quantity integer,p_confirm boolean)returns void language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
declare actor uuid;s halloween_private.store_prizes;used integer;
begin
 actor:=halloween_private.require_staff();
 perform 1 from halloween_private.campaigns where id=p_campaign for update;
 select * into strict s from halloween_private.store_prizes where campaign_id=p_campaign and store_id=p_store and slot=p_slot for update;
 if p_quantity is null or p_quantity<0 or p_quantity>100000 or p_confirm is distinct from true then raise exception 'Confirme a quantidade física reservada';end if;
 used:=s.quantity-s.remaining;
 if p_quantity<used then raise exception 'Quantidade inferior aos prêmios reservados/entregues';end if;
 update halloween_private.store_prizes set quantity=p_quantity,remaining=p_quantity-used,enabled=p_quantity>0 where campaign_id=p_campaign and store_id=p_store and slot=p_slot;
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(p_campaign,'store_prize_configured',jsonb_build_object('store',p_store,'slot',p_slot,'before',s.quantity,'after',p_quantity)::text,actor);
end $$;
create or replace function halloween_private.draw_pool_for(p_campaign text,p_excluded integer[],p_store uuid)returns table(product_id integer,chance_bps numeric)language sql stable security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
with available as(select p.id,p.weight from halloween_private.products p where p.campaign_id=p_campaign and(p.id in(12,13)or(p.enabled and p.weight>0)) and not(p.id=any(coalesce(p_excluded,'{}')))and
case when p.id in(12,13)then exists(select 1 from halloween_private.store_prizes sp join halloween_private.margin_stores ms on ms.campaign_id=sp.campaign_id and ms.store_id=sp.store_id where sp.campaign_id=p_campaign and sp.store_id=p_store and sp.slot=p.id and sp.enabled and sp.remaining>0 and ms.unlocked_at is not null)else p.unlimited or p.remaining>0 end),totals as(select coalesce(sum(weight)filter(where id not in(12,13)),0)::numeric common,count(*)filter(where id in(12,13))*50 rare from available)
select a.id,case when a.id in(12,13)then 50::numeric else a.weight*(10000-t.rare)/nullif(t.common,0)end from available a cross join totals t where t.common>0
$$;
-- Reservation is atomic with the coupon insert and the existing campaign mutex.
create function halloween_private.reserve_store_prize()returns trigger language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
declare store uuid;s halloween_private.store_prizes;
begin
 if new.product_id not in(12,13)then return new;end if;
 select loja_id into store from halloween_private.tickets where id=new.ticket_id;
 select * into s from halloween_private.store_prizes where campaign_id=new.campaign_id and store_id=store and slot=new.product_id for update;
 if not found or not s.enabled or s.remaining<1 or not exists(select 1 from halloween_private.margin_stores where campaign_id=new.campaign_id and store_id=store and unlocked_at is not null)then raise exception 'Prêmio indisponível nesta loja';end if;
 update halloween_private.store_prizes set remaining=remaining-1 where campaign_id=s.campaign_id and store_id=s.store_id and slot=s.slot;
 new.offer:=jsonb_build_object('id',s.slot,'name',s.name,'code',s.code,'benefit_type','percent','benefit_value',100,'unlimited_units',false,'loja_id',store,'loja',(select nome from public.lojas where id=store));
 return new;
end $$;
create function halloween_private.link_store_prize()returns trigger language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
begin if new.product_id in(12,13)then insert into halloween_private.store_reservations(coupon_id,campaign_id,store_id,slot)select new.id,new.campaign_id,t.loja_id,new.product_id from halloween_private.tickets t where t.id=new.ticket_id;end if;return new;end $$;
create trigger reserve_store_prize before insert on halloween_private.coupons for each row execute function halloween_private.reserve_store_prize();
create trigger link_store_prize after insert on halloween_private.coupons for each row execute function halloween_private.link_store_prize();
create function halloween_private.return_store_prize()returns trigger language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
declare r halloween_private.store_reservations;
begin
 if old.released_at is null and new.released_at is not null and new.redeemed_at is null then
 update halloween_private.store_reservations set released_at=new.released_at where coupon_id=new.id and released_at is null returning * into r;
 if found then update halloween_private.store_prizes set remaining=remaining+1 where campaign_id=r.campaign_id and store_id=r.store_id and slot=r.slot;end if;
 end if;return new;
end $$;
create trigger return_store_prize after update of released_at on halloween_private.coupons for each row execute function halloween_private.return_store_prize();
create or replace function halloween_private.release_expired(p_campaign text)returns void language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
begin
 with released as(update halloween_private.coupons set released_at=clock_timestamp() where campaign_id=p_campaign and redeemed_at is null and released_at is null and expires_at<=clock_timestamp()returning id,product_id),counts as(select product_id,count(*)::integer qty from released r where not exists(select 1 from halloween_private.store_reservations s where s.coupon_id=r.id)group by product_id)
 update halloween_private.products p set remaining=p.remaining+x.qty from counts x where p.campaign_id=p_campaign and p.id=x.product_id and not p.unlimited;
end $$;
do $$declare body text;begin
 body:=pg_get_functiondef('halloween_private.spin(text)'::regprocedure);
 if position('if not p.unlimited then'in body)=0 then raise exception 'Spin incompatível';end if;
 execute replace(body,'if not p.unlimited then','if not p.unlimited and p.id not in(12,13)then');
 body:=pg_get_functiondef('halloween_private.reissue(text,text)'::regprocedure);
 if position('and r.released_at is null then'in body)=0 then raise exception 'Reemissão incompatível';end if;
 execute replace(body,'and r.released_at is null then','and r.released_at is null and not exists(select 1 from halloween_private.store_reservations s where s.coupon_id=r.id)then');
end $$;
-- Financial invalidation releases the original allocation only, once.
do $$declare body text;begin
 body:=pg_get_functiondef('halloween_private.sync_sales()'::regprocedure);
 if position('returning r.product_id'in body)=0 or position('from released group by product_id'in body)=0 then raise exception 'Sincronização incompatível';end if;
 body:=replace(body,'returning r.product_id','returning r.id,r.product_id');
 body:=replace(body,'from released group by product_id','from released r where not exists(select 1 from halloween_private.store_reservations sr where sr.coupon_id=r.id)group by product_id');
 execute body;
end $$;
-- Only public pre-result surfaces are redacted; internal staff catalog stays complete.
create function halloween_private.surprise_catalog(p_catalog jsonb)returns jsonb language sql immutable set search_path=''as $$select p_catalog||jsonb_build_object('products',coalesce((select jsonb_agg(jsonb_build_object('id',x->'id'))from jsonb_array_elements(p_catalog->'products')x),'[]'))$$;
create or replace function public.halloween_catalog(p_campaign text default 'halloween-2026')returns jsonb language sql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$select halloween_private.surprise_catalog(halloween_private.catalog(p_campaign))$$;
create or replace function public.halloween_ticket(p_token text)returns jsonb language sql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$select jsonb_set(t,'{campaign}',halloween_private.surprise_catalog(t->'campaign'))from(select halloween_private.ticket(p_token)t)x$$;
alter table halloween_private.store_prizes enable row level security;
alter table halloween_private.store_reservations enable row level security;
revoke all on halloween_private.store_prizes,halloween_private.store_reservations from public,anon,authenticated;
revoke all on function halloween_private.reserve_store_prize(),halloween_private.link_store_prize(),halloween_private.return_store_prize(),halloween_private.surprise_catalog(jsonb)from public,anon,authenticated;
revoke all on function public.halloween_store_prizes_state(text),public.halloween_configure_store_prize(text,uuid,integer,integer,boolean)from public,anon;
grant execute on function public.halloween_store_prizes_state(text),public.halloween_configure_store_prize(text,uuid,integer,integer,boolean)to authenticated;
commit;
