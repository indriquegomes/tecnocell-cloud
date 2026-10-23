-- Campaign-only migration. ERP tables below are read, never changed.
begin;
set local lock_timeout='3s';
do $$begin if exists(select 1 from halloween_private.campaigns where id='halloween-2026' and active) then raise exception 'Pause a campanha real antes de atualizar as regras.';end if;end $$;

alter table halloween_private.products add column unlimited boolean not null default false;
alter table halloween_private.products add column enabled boolean not null default true;
alter table halloween_private.campaigns add column starts_at timestamptz;
alter table halloween_private.campaigns add column ends_at timestamptz;
alter table halloween_private.tickets add column loja_id uuid;
alter table halloween_private.tickets add column os_id uuid;
alter table halloween_private.tickets add column replaces_coupon_id uuid unique references halloween_private.coupons(id);
create unique index halloween_ticket_os on halloween_private.tickets(campaign_id,os_id) where os_id is not null and replaces_coupon_id is null;
alter table halloween_private.tickets add column excluded_products integer[] not null default '{}';
alter table halloween_private.coupons add column voided_at timestamptz;
alter table halloween_private.coupons add column voided_by uuid;
alter table halloween_private.coupons add column void_reason text;
drop index halloween_private.halloween_ticket_sale;
create unique index halloween_ticket_sale on halloween_private.tickets(campaign_id,sale_id) where sale_id is not null and replaces_coupon_id is null;
update halloween_private.campaigns set starts_at='2026-10-26 00:00:00-03',ends_at='2026-11-01 00:00:00-03' where id='halloween-2026';
update halloween_private.products p set benefit_type='percent',benefit_value=v.discount,unlimited=p.id<=11,weight=v.weight
from(values(1,15,1269),(2,20,1269),(3,20,1269),(4,15,508),(5,20,508),(6,15,1269),(7,18,1269),(8,15,254),(9,18,1269),(10,18,508),(11,10,508),(12,100,50),(13,100,50))v(id,discount,weight)
where p.campaign_id in('halloween-2026','halloween-2026-test') and p.id=v.id;
update halloween_private.tickets t set loja_id=d.loja_id from public.vendas v join public.depositos d on d.id=v.deposito_id where t.sale_id=v.id;

create function halloween_private.sale_paid(p_sale uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vendas v where v.id=p_sale and v.status='concluida'
 and not exists(select 1 from public.lancamentos l where l.venda_id=v.id and l.tipo='receber' and l.status is distinct from 'cancelado' and l.status is distinct from 'pago' and round(coalesce(l.valor,0)-coalesce(l.valor_pago,0),2)>0)
 -- Credit is consumed separately. Payments and ledger receipts describe the
 -- same money, so use their maximum rather than counting both copies.
 and coalesce((select sum(p.valor) from public.pagamentos_venda p where p.venda_id=v.id and p.status='vale'),0)
 +greatest(coalesce((select sum(p.valor+coalesce(p.taxa,0)) from public.pagamentos_venda p where p.venda_id=v.id and p.status='pago'),0),
 coalesce((select sum(case when l.status='pago' then l.valor else coalesce(l.valor_pago,0) end) from public.lancamentos l where l.venda_id=v.id and l.tipo='receber' and l.status is distinct from 'cancelado'),0))>=v.total)
$$;

-- The existing OS receipt has no foreign key on its financial entry. Match its
-- unique receipt label, holder, amount and receipt time; reject ambiguous matches.
create function halloween_private.paid_os(p_os uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'customer_id',o.pessoa_id,'customer',p.nome,'amount',o.total,'received_at',o.recebido_em,'loja_id',receipt.loja_id)
 from public.ordens_servico o join public.pessoas p on p.id=o.pessoa_id and nullif(btrim(p.nome),'')is not null
 cross join lateral(select min(l.loja_id::text)::uuid loja_id from public.lancamentos l
 where l.tipo='receber'and l.status='pago'and l.valor>=o.total and l.descricao='Recebimento OS #'||o.numero::text
 and l.pessoa_nome is not distinct from o.pessoa_nome and l.loja_id is not null
 and l.created_at between o.recebido_em-interval '1 minute'and o.recebido_em+interval '10 minutes'
 having count(*)=1)receipt
 join public.lojas loja on loja.id=receipt.loja_id and loja.ativa
 where o.id=p_os and o.status='entregue'and o.recebido_em is not null and o.total>=200
$$;
create or replace function halloween_private.sale_valid(p_ticket uuid) returns boolean language sql stable security definer set search_path='' as $$
 select t.revoked_at is null and (c.test_mode or(t.sale_id is not null and halloween_private.sale_paid(t.sale_id) and exists(
 select 1 from public.vendas v where v.id=t.sale_id and v.status='concluida' and v.total>=200 and v.pessoa_id=t.customer_id and not coalesce(v.uso_interno,false) and v.ml_order_id is null))
 or coalesce(t.os_id is not null and halloween_private.paid_os(t.os_id)->>'customer_id'=t.customer_id,false))
 from halloween_private.tickets t join halloween_private.campaigns c on c.id=t.campaign_id where t.id=p_ticket
$$;

create function halloween_private.draw_pool_for(p_campaign text,p_excluded integer[]) returns table(product_id integer,chance_bps numeric) language sql stable security definer set search_path='' as $$
 with available as(select id,weight from halloween_private.products where campaign_id=p_campaign and enabled and (unlimited or remaining>0) and weight>0 and not(id=any(coalesce(p_excluded,'{}')))),
 totals as(select coalesce(sum(weight)filter(where id not in(12,13)),0)::numeric common,coalesce(sum(weight)filter(where id in(12,13)),0)::numeric rare from available)
 select a.id,case when a.id in(12,13)then a.weight::numeric else a.weight*(10000-t.rare)/nullif(t.common,0)end from available a cross join totals t where t.common>0 and t.rare<10000
$$;
create or replace function halloween_private.draw_pool(p_campaign text) returns table(product_id integer,chance_bps numeric) language sql stable security definer set search_path='' as $$select * from halloween_private.draw_pool_for(p_campaign,'{}')$$;

create function halloween_private.catalog_for(p_campaign text,p_excluded integer[]) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'title',c.title,'active',c.active,'test_mode',c.test_mode,'server_time',clock_timestamp(),'starts_at',c.starts_at,'ends_at',c.ends_at,
 'participation_open',c.active and(c.starts_at is null or clock_timestamp()>=c.starts_at)and(c.ends_at is null or clock_timestamp()<c.ends_at),
 'can_spin',exists(select 1 from halloween_private.draw_pool_for(c.id,p_excluded)),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value,'unlimited',p.unlimited,
 'chance_base',p.weight/100.0,'chance_current',coalesce(d.chance_bps/100.0,0),'available',p.enabled and(p.unlimited or p.remaining>0)and not(p.id=any(coalesce(p_excluded,'{}'))))order by p.id),'[]'::jsonb)
 from halloween_private.products p left join halloween_private.draw_pool_for(c.id,p_excluded)d on d.product_id=p.id where p.campaign_id=c.id))from halloween_private.campaigns c where c.id=p_campaign
$$;
create or replace function halloween_private.catalog(p_campaign text) returns jsonb language sql stable security definer set search_path='' as $$select halloween_private.catalog_for(p_campaign,'{}')$$;

create or replace function halloween_private.release_expired(p_campaign text) returns void language plpgsql security definer set search_path='' as $$
begin
 with released as(update halloween_private.coupons set released_at=clock_timestamp() where campaign_id=p_campaign and redeemed_at is null and released_at is null and expires_at<=clock_timestamp()returning product_id),
 counts as(select product_id,count(*)::integer qty from released group by product_id)
 update halloween_private.products p set remaining=p.remaining+x.qty from counts x where p.campaign_id=p_campaign and p.id=x.product_id and not p.unlimited;
end $$;

-- Follow replacement tickets without exposing token material in a public catalog.
create function halloween_private.resolve_ticket(p_token text)returns halloween_private.tickets language plpgsql stable security definer set search_path='' as $$
declare t halloween_private.tickets; next_ticket halloween_private.tickets; n integer:=0;
begin
 if p_token is null or p_token!~'^[a-f0-9]{64}$'then raise exception 'Link de giro inválido.';end if;
 select * into t from halloween_private.tickets where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Link de giro inválido.';end if;
 loop
  select child.* into next_ticket from halloween_private.tickets child join halloween_private.coupons r on r.id=child.replaces_coupon_id where r.ticket_id=t.id;
  exit when not found;
  t:=next_ticket;n:=n+1;if n>100 then raise exception 'Solicite à loja uma revisão deste giro.';end if;
 end loop;
 return t;
end $$;

create or replace function halloween_private.coupon_json(p_id uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'code',r.code,'offer',r.offer,'created_at',r.created_at,'expires_at',r.expires_at,'redeemed_at',r.redeemed_at,
 'status',case when r.voided_at is not null then 'replaced' when not halloween_private.sale_valid(r.ticket_id)then 'revoked' when r.redeemed_at is not null then 'redeemed' when r.released_at is not null or r.expires_at<=clock_timestamp()then 'expired' else 'available'end)
 from halloween_private.coupons r where r.id=p_id
$$;

create or replace function halloween_private.ticket(p_token text)returns jsonb language plpgsql security definer set search_path='' as $$
declare t halloween_private.tickets; c halloween_private.campaigns; r uuid;
begin
 t:=halloween_private.resolve_ticket(p_token); select * into c from halloween_private.campaigns where id=t.campaign_id;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 return jsonb_build_object('campaign',halloween_private.catalog_for(c.id,t.excluded_products),'customer',t.customer,'expires_at',t.expires_at,'server_time',clock_timestamp(),'loja_id',t.loja_id,
 'loja',(select nome from public.lojas where id=t.loja_id),'replacement',t.replaces_coupon_id is not null,
 'status',case when not halloween_private.sale_valid(t.id)then 'revoked' when r is not null then 'used' when t.expires_at<=clock_timestamp()then 'expired' when not c.active or(c.starts_at is not null and clock_timestamp()<c.starts_at)then 'paused' else 'available'end,'result',halloween_private.coupon_json(r));
end $$;

create or replace function halloween_private.spin(p_token text)returns jsonb language plpgsql security definer set search_path='' as $$
declare t halloween_private.tickets; c halloween_private.campaigns; r uuid; p halloween_private.products; v_pick record; v_ticket double precision; v_total numeric; v_now timestamptz;
begin
 t:=halloween_private.resolve_ticket(p_token);
 -- Campaign lock serializes spin/reissue/redemption; no ERP lock is acquired.
 select * into c from halloween_private.campaigns where id=t.campaign_id for update;
 t:=halloween_private.resolve_ticket(p_token);
 perform 1 from halloween_private.tickets where id=t.id for update;
 if not halloween_private.sale_valid(t.id)then raise exception 'Esta compra não está paga ou deixou de atender às regras. Consulte a loja.';end if;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 if r is not null then return halloween_private.coupon_json(r);end if;
 v_now:=clock_timestamp();
 if t.expires_at<=v_now then raise exception 'Seu prazo para girar terminou.';end if;
 if not c.active or(c.starts_at is not null and v_now<c.starts_at)then raise exception 'A campanha ainda não está liberada. Consulte a loja.';end if;
 perform halloween_private.release_expired(c.id);
 select coalesce(sum(chance_bps),0)into v_total from halloween_private.draw_pool_for(c.id,t.excluded_products);
 if v_total=0 then raise exception 'Sem ofertas disponíveis para este giro. Ele não foi consumido; consulte a loja.';end if;
 v_ticket:=('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint/4294967296.0*v_total;
 for v_pick in select * from halloween_private.draw_pool_for(c.id,t.excluded_products)order by product_id loop
  v_ticket:=v_ticket-v_pick.chance_bps;
  if v_ticket<0 then select * into p from halloween_private.products where campaign_id=c.id and id=v_pick.product_id;exit;end if;
 end loop;
 if not p.unlimited then update halloween_private.products set remaining=remaining-1 where campaign_id=c.id and id=p.id;end if;
 insert into halloween_private.coupons(ticket_id,campaign_id,product_id,offer,code,created_at,expires_at)
 values(t.id,c.id,p.id,jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value,'unlimited_units',p.unlimited,'loja_id',t.loja_id,'loja',(select nome from public.lojas where id=t.loja_id)),
 'TC-'||upper(encode(extensions.gen_random_bytes(12),'hex')),v_now,v_now+interval '48 hours')returning id into r;
 insert into halloween_private.audit(campaign_id,action,object_id)values(c.id,'spin',r::text);
 return halloween_private.coupon_json(r);
end $$;

create function halloween_private.reissue(p_code text,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; r halloween_private.coupons; t halloween_private.tickets; child halloween_private.tickets; c halloween_private.campaigns; v_id uuid; v_token text; v_now timestamptz;
begin
 v_user:=halloween_private.require_staff();
 if p_reason is null or length(btrim(p_reason))not between 5 and 300 then raise exception 'Informe o motivo da indisponibilidade (5 a 300 caracteres).';end if;
 select * into r from halloween_private.coupons where code=upper(btrim(p_code));if not found then raise exception 'Código não encontrado.';end if;
 select * into c from halloween_private.campaigns where id=r.campaign_id for update;
 select * into r from halloween_private.coupons where id=r.id for update;
 select * into t from halloween_private.tickets where id=r.ticket_id for update;
 select * into child from halloween_private.tickets where replaces_coupon_id=r.id;
 if not found then
  if r.redeemed_at is not null then raise exception 'Vale já resgatado. Não é possível devolver este giro.';end if;
  if r.voided_at is not null or r.released_at is not null or r.expires_at<=clock_timestamp()then raise exception 'Vale cancelado ou vencido. Solicite revisão à administração.';end if;
  if not halloween_private.sale_valid(t.id)then raise exception 'Compra inelegível. Não é possível devolver este giro.';end if;
  v_now:=clock_timestamp();v_id:=gen_random_uuid();v_token:=encode(extensions.hmac(convert_to(v_id::text,'UTF8'),c.secret,'sha256'),'hex');
  update halloween_private.coupons set voided_at=v_now,voided_by=v_user,void_reason=btrim(p_reason),released_at=v_now where id=r.id;
  if not coalesce((r.offer->>'unlimited_units')::boolean,false) and r.released_at is null then
   update halloween_private.products set remaining=remaining+1 where campaign_id=c.id and id=r.product_id and not unlimited;
  end if;
  insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,customer_id,sale_id,os_id,loja_id,amount_cents,token_hash,created_at,expires_at,created_by,replaces_coupon_id,excluded_products)
  values(v_id,c.id,'RETRY'||replace(r.id::text,'-',''),t.customer,coalesce(t.customer_id,'test:'||t.id::text),t.sale_id,t.os_id,t.loja_id,t.amount_cents,encode(extensions.digest(v_token,'sha256'),'hex'),v_now,v_now+interval '48 hours',v_user,r.id,
  array(select distinct unnest(t.excluded_products||r.product_id)))returning * into child;
  insert into halloween_private.audit(campaign_id,action,object_id,actor)values(c.id,'coupon_replaced',r.id::text,v_user);
 end if;
 return jsonb_build_object('id',child.id,'expires_at',child.expires_at,'customer',child.customer,'token',encode(extensions.hmac(convert_to(child.id::text,'UTF8'),c.secret,'sha256'),'hex'),'test_mode',c.test_mode);
end $$;

create function halloween_private.redeem_at(p_code text,p_loja uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; r halloween_private.coupons; t halloween_private.tickets; c halloween_private.campaigns;
begin
 v_user:=halloween_private.require_staff();select * into r from halloween_private.coupons where code=upper(btrim(p_code));if not found then raise exception 'Código não encontrado.';end if;
 -- A short shared read lock keeps cancellation from racing this redemption.
 -- No payment, till or ERP stock record is changed.
 perform 1 from public.vendas v join halloween_private.tickets source on source.sale_id=v.id where source.id=r.ticket_id for share of v;
 perform 1 from public.ordens_servico o join halloween_private.tickets source on source.os_id=o.id where source.id=r.ticket_id for share of o;
 select * into c from halloween_private.campaigns where id=r.campaign_id for update;
 select * into r from halloween_private.coupons where id=r.id for update;select * into t from halloween_private.tickets where id=r.ticket_id;
 if r.voided_at is not null then raise exception 'Este cupom foi cancelado para devolver um giro e não pode ser usado.';end if;
 if not c.test_mode and(t.loja_id is null or p_loja is distinct from t.loja_id)then raise exception 'Resgate permitido somente na loja da compra. Confira a unidade.';end if;
 if not halloween_private.sale_valid(t.id)then raise exception 'Compra não paga ou inelegível. Vale bloqueado.';end if;
 if r.redeemed_at is not null then return halloween_private.coupon_json(r.id);end if;
 if r.expires_at<=clock_timestamp()or r.released_at is not null then raise exception 'Este vale venceu e não pode ser resgatado.';end if;
 update halloween_private.coupons set redeemed_at=clock_timestamp(),redeemed_by=v_user where id=r.id;
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(c.id,'redeem',r.id::text,v_user);return halloween_private.coupon_json(r.id);
end $$;
create or replace function halloween_private.redeem(p_code text)returns jsonb language sql security definer set search_path='' as $$select halloween_private.redeem_at(p_code,null)$$;

create or replace function halloween_private.capture_sale(p_campaign text,p_sale jsonb,p_customer text)returns uuid language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns; v_id uuid; v_token text; v_time timestamptz; v_loja uuid;
begin
 select * into c from halloween_private.campaigns where id=p_campaign;
 if not found or not c.active or not c.stock_confirmed then return null;end if;
 v_time:=(p_sale->>'created_at')::timestamptz;
 if p_sale->>'status'is distinct from 'concluida' or coalesce((p_sale->>'total')::numeric,0)<200 or coalesce((p_sale->>'uso_interno')::boolean,false)or p_sale->>'ml_order_id'is not null
 or nullif(btrim(p_sale->>'pessoa_id'),'')is null or nullif(btrim(p_customer),'')is null or v_time is null or v_time<=clock_timestamp()-interval '48 hours'
 or(c.starts_at is not null and v_time<c.starts_at)or(c.ends_at is not null and v_time>=c.ends_at)
 or not exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and v_time>=w.started_at and(w.ended_at is null or v_time<w.ended_at))then return null;end if;
 select d.loja_id into v_loja from public.depositos d join public.lojas l on l.id=d.loja_id and l.ativa where d.id=p_sale->>'deposito_id';
 if not c.test_mode and(v_loja is null or not halloween_private.sale_paid((p_sale->>'id')::uuid))then return null;end if;
 select id into v_id from halloween_private.tickets where campaign_id=c.id and sale_id=(p_sale->>'id')::uuid and replaces_coupon_id is null;if found then return v_id;end if;
 v_id:=gen_random_uuid();v_token:=encode(extensions.hmac(convert_to(v_id::text,'UTF8'),c.secret,'sha256'),'hex');
 insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,customer_id,sale_id,loja_id,amount_cents,token_hash,created_at,expires_at,created_by)
 values(v_id,c.id,'VENDA'||replace(p_sale->>'id','-',''),left(btrim(p_customer),80),p_sale->>'pessoa_id',(p_sale->>'id')::uuid,v_loja,least(round((p_sale->>'total')::numeric*100),2147483647)::integer,
 encode(extensions.digest(v_token,'sha256'),'hex'),v_time,v_time+interval '48 hours',(p_sale->>'vendedor_id')::uuid);
 insert into halloween_private.audit(campaign_id,action,object_id)values(c.id,'sale_auto_issue',v_id::text);return v_id;
end $$;

create function halloween_private.capture_os(p_campaign text,p_os uuid)returns uuid language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns; data jsonb; received timestamptz; tid uuid; token text;
begin
 select * into c from halloween_private.campaigns where id=p_campaign;
 if not found or not c.active or not c.stock_confirmed then return null;end if;
 data:=halloween_private.paid_os(p_os);if data is null then return null;end if;received:=(data->>'received_at')::timestamptz;
 if received<=clock_timestamp()-interval '48 hours'or(c.starts_at is not null and received<c.starts_at)or(c.ends_at is not null and received>=c.ends_at)
 or not exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and received>=w.started_at and(w.ended_at is null or received<w.ended_at))then return null;end if;
 select id into tid from halloween_private.tickets where campaign_id=c.id and os_id=p_os and replaces_coupon_id is null;if found then return tid;end if;
 tid:=gen_random_uuid();token:=encode(extensions.hmac(convert_to(tid::text,'UTF8'),c.secret,'sha256'),'hex');
 insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,customer_id,os_id,loja_id,amount_cents,token_hash,created_at,expires_at)
 values(tid,c.id,'OS'||replace(p_os::text,'-',''),left(data->>'customer',80),data->>'customer_id',p_os,(data->>'loja_id')::uuid,least(round((data->>'amount')::numeric*100),2147483647)::integer,encode(extensions.digest(token,'sha256'),'hex'),received,received+interval '48 hours');
 insert into halloween_private.audit(campaign_id,action,object_id)values(c.id,'os_auto_issue',tid::text);return tid;
end $$;

-- A short bounded reconciliation; skipped campaigns are retried next minute.
create or replace function halloween_private.sync_sales()returns integer language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns; v record; n integer:=0;
begin
 for c in select * from halloween_private.campaigns where not test_mode for update skip locked loop
  begin
   update halloween_private.tickets t set revoked_at=clock_timestamp(),revoked_reason='Compra não paga, cancelada ou fora das regras.'where t.campaign_id=c.id and(t.sale_id is not null or t.os_id is not null)and t.revoked_at is null and not halloween_private.sale_valid(t.id);
   with released as(update halloween_private.coupons r set released_at=clock_timestamp()from halloween_private.tickets t where r.ticket_id=t.id and t.campaign_id=c.id and t.revoked_at is not null and r.redeemed_at is null and r.released_at is null returning r.product_id),
   counts as(select product_id,count(*)::integer qty from released group by product_id)
   update halloween_private.products p set remaining=p.remaining+x.qty from counts x where p.campaign_id=c.id and p.id=x.product_id and not p.unlimited;
   perform halloween_private.release_expired(c.id);
   if c.active and c.stock_confirmed and(c.starts_at is null or clock_timestamp()>=c.starts_at)then
    for v in select to_jsonb(s)sale,p.nome from public.vendas s join public.pessoas p on p.id=s.pessoa_id
    where s.status='concluida'and s.total>=200 and not coalesce(s.uso_interno,false)and s.ml_order_id is null and s.created_at>clock_timestamp()-interval '48 hours'
    and(c.starts_at is null or s.created_at>=c.starts_at)and(c.ends_at is null or s.created_at<c.ends_at)
    and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and s.created_at>=w.started_at and(w.ended_at is null or s.created_at<w.ended_at))
    and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.sale_id=s.id and t.replaces_coupon_id is null)
    and nullif(btrim(p.nome),'')is not null
    and(c.test_mode or(halloween_private.sale_paid(s.id)and exists(select 1 from public.depositos d join public.lojas l on l.id=d.loja_id and l.ativa where d.id=s.deposito_id)))
    order by s.created_at limit 200 loop
     if halloween_private.capture_sale(c.id,v.sale,v.nome)is not null then n:=n+1;end if;
    end loop;
    for v in select o.id from public.ordens_servico o where o.status='entregue'and o.total>=200 and o.pessoa_id is not null and o.recebido_em>clock_timestamp()-interval '48 hours'
    and(c.starts_at is null or o.recebido_em>=c.starts_at)and(c.ends_at is null or o.recebido_em<c.ends_at)
    and halloween_private.paid_os(o.id)is not null
    and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and o.recebido_em>=w.started_at and(w.ended_at is null or o.recebido_em<w.ended_at))
    and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.os_id=o.id and t.replaces_coupon_id is null)order by o.recebido_em limit 200 loop
     if halloween_private.capture_os(c.id,v.id)is not null then n:=n+1;end if;
    end loop;
   end if;
   update halloween_private.campaigns set last_sync_at=clock_timestamp(),sync_error=null where id=c.id;
  exception when others then update halloween_private.campaigns set sync_error='Falha na conferência da promoção. Solicite revisão à administração.'where id=c.id;end;
 end loop;return n;
end $$;

create function halloween_private.admin_state_v2(p_campaign text,p_search text,p_offset integer)returns jsonb language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns; clients jsonb; total integer;
begin
 perform halloween_private.require_staff();
 if p_offset is null or p_offset<0 or p_offset>100000 or length(coalesce(p_search,''))>80 then raise exception 'Busca ou página inválida.';end if;
 select * into c from halloween_private.campaigns where id=p_campaign;if not found then raise exception 'Campanha não encontrada.';end if;
 -- No campaign lock or cleanup on dashboard reads.
 select coalesce(jsonb_agg(to_jsonb(x)order by x.latest desc,x.client_key),'[]'::jsonb)into clients from(
 select coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)client_key,max(t.customer)customer,count(*)total,
 count(*)filter(where t.revoked_at is null and r.id is null and t.expires_at>clock_timestamp())available,
 count(*)filter(where t.revoked_at is null and r.id is not null and r.voided_at is null)used,
 count(*)filter(where t.revoked_at is null and r.id is null and t.expires_at<=clock_timestamp())expired,
 count(*)filter(where t.revoked_at is not null)revoked,max(t.created_at)latest
 from halloween_private.tickets t left join halloween_private.coupons r on r.ticket_id=t.id
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=c.id and position(lower(coalesce(p_search,''))in lower(t.customer))>0
 group by coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)order by latest desc,client_key limit 50 offset p_offset)x;
 select count(*)into total from(select distinct coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)k from halloween_private.tickets t
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=c.id and position(lower(coalesce(p_search,''))in lower(t.customer))>0)x;
 return jsonb_build_object('campaign',halloween_private.catalog(c.id),'stock_confirmed',c.stock_confirmed,'last_sync_at',c.last_sync_at,'sync_error',c.sync_error,
 'clients',clients,'clients_total',total,'pending',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from(
 select s.numero from public.vendas s where not c.test_mode and c.active and s.status='concluida'and s.total>=200 and not coalesce(s.uso_interno,false)and s.ml_order_id is null
 and s.created_at>clock_timestamp()-interval '48 hours'and(c.starts_at is null or s.created_at>=c.starts_at)and(c.ends_at is null or s.created_at<c.ends_at)
 and not exists(select 1 from public.pessoas p where p.id=s.pessoa_id and nullif(btrim(p.nome),'')is not null)
 and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and s.created_at>=w.started_at and(w.ended_at is null or s.created_at<w.ended_at))
 and halloween_private.sale_paid(s.id)order by s.created_at desc limit 100)x),
 'stores',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)order by nome),'[]'::jsonb)from public.lojas where ativa),
 'products',(select jsonb_agg(to_jsonb(p)order by p.id)from halloween_private.products p where campaign_id=c.id),
 'metrics',jsonb_build_object('tickets',(select count(*)from halloween_private.tickets where campaign_id=c.id),'spins',(select count(*)from halloween_private.coupons where campaign_id=c.id and voided_at is null),'redeemed',(select count(*)from halloween_private.coupons where campaign_id=c.id and redeemed_at is not null)));
end $$;
create or replace function halloween_private.admin_state(p_campaign text)returns jsonb language sql security definer set search_path='' as $$select halloween_private.admin_state_v2(p_campaign,'',0)$$;

create or replace function halloween_private.client_tickets(p_campaign text,p_customer text,p_offset integer default 0)returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; data jsonb;
begin
 v_user:=halloween_private.require_staff();if p_offset<0 or p_offset>100000 then raise exception 'Página inválida.';end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc,x.id),'[]'::jsonb)into data from(
 select t.id,t.customer,t.customer_id,t.purchase_ref,t.created_at,t.expires_at,t.amount_cents,t.loja_id,(select nome from public.lojas where id=t.loja_id)loja,t.replaces_coupon_id,
 case when not halloween_private.sale_valid(t.id)then 'revoked'when r.voided_at is not null then 'replaced'when r.id is not null then 'used'when t.expires_at<=clock_timestamp()then 'expired'else 'available'end status,
 halloween_private.coupon_json(r.id)result,encode(extensions.hmac(convert_to(t.id::text,'UTF8'),c.secret,'sha256'),'hex')token
 from halloween_private.tickets t join halloween_private.campaigns c on c.id=t.campaign_id left join halloween_private.coupons r on r.ticket_id=t.id
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=p_campaign and coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)=p_customer order by t.created_at desc,t.id limit 50 offset p_offset)x;
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(p_campaign,'client_links_view',p_customer,v_user);return data;
end $$;

create or replace function halloween_private.configure(p_campaign text,p_products jsonb,p_confirm boolean,p_active boolean)returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; c halloween_private.campaigns; e jsonb; p halloween_private.products; v_qty integer; v_weight integer;
begin
 uid:=halloween_private.require_staff();select * into c from halloween_private.campaigns where id=p_campaign for update;if not found then raise exception 'Campanha não encontrada.';end if;
 if jsonb_typeof(p_products)is distinct from 'array'or jsonb_array_length(p_products)<>(select count(*)from halloween_private.products where campaign_id=c.id)
 or(select count(distinct(x->>'id')::integer)from jsonb_array_elements(p_products)x)<>jsonb_array_length(p_products)then raise exception 'Envie todos os produtos, sem duplicar.';end if;
 perform halloween_private.release_expired(c.id);
 for e in select * from jsonb_array_elements(p_products)loop
  select * into p from halloween_private.products where campaign_id=c.id and id=(e->>'id')::integer;
  if not found or e->>'quantity'is null or e->>'weight'is null or(e->>'quantity')!~'^\d{1,6}$'or(e->>'weight')!~'^\d{1,5}$'then raise exception 'Configuração inválida.';end if;
  v_qty:=(e->>'quantity')::integer;v_weight:=(e->>'weight')::integer;
  if(p.id in(12,13)and v_weight<>50)or v_qty>100000 or v_weight>10000 or(not p.unlimited and v_qty<p.quantity-p.remaining)then raise exception 'Confira quantidades; os raros mantêm chance de0,5 por cento.';end if;
  update halloween_private.products set quantity=case when p.unlimited then quantity else v_qty end,remaining=case when p.unlimited then remaining else remaining+v_qty-quantity end,weight=v_weight,enabled=coalesce((e->>'enabled')::boolean,p.enabled)where campaign_id=c.id and id=p.id;
 end loop;
 if(select sum(p.weight)from halloween_private.products p where campaign_id=c.id)<>10000 then raise exception 'As chances base devem somar100 por cento.';end if;
 if p_active and(not coalesce(p_confirm,false)or not exists(select 1 from halloween_private.draw_pool(c.id)))then raise exception 'Confirme disponibilidade e quantidades antes de ativar.';end if;
 update halloween_private.campaigns set active=coalesce(p_active,false),stock_confirmed=coalesce(p_confirm,false)where id=c.id;
 insert into halloween_private.audit(campaign_id,action,actor)values(c.id,'configure',uid);return halloween_private.admin_state(c.id);
end $$;

create function public.halloween_reissue(p_code text,p_reason text)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.reissue(p_code,p_reason)$$;
create function public.halloween_redeem_at(p_code text,p_loja uuid)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.redeem_at(p_code,p_loja)$$;
create function public.halloween_admin_state_v2(p_campaign text,p_search text default '',p_offset integer default 0)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.admin_state_v2(p_campaign,p_search,p_offset)$$;
revoke all on function halloween_private.sale_paid(uuid),halloween_private.draw_pool_for(text,integer[]),halloween_private.catalog_for(text,integer[]),halloween_private.resolve_ticket(text),halloween_private.reissue(text,text),halloween_private.redeem_at(text,uuid),halloween_private.admin_state_v2(text,text,integer),public.halloween_reissue(text,text),public.halloween_redeem_at(text,uuid),public.halloween_admin_state_v2(text,text,integer)from public,anon,authenticated;
revoke all on function halloween_private.paid_os(uuid),halloween_private.capture_os(text,uuid)from public,anon,authenticated;
grant execute on function halloween_private.reissue(text,text),halloween_private.redeem_at(text,uuid),halloween_private.admin_state_v2(text,text,integer),public.halloween_reissue(text,text),public.halloween_redeem_at(text,uuid),public.halloween_admin_state_v2(text,text,integer)to authenticated;
notify pgrst,'reload schema';
commit;
