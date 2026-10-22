-- Incremental campaign migration. Reads ERP sales; never writes to ERP tables.
begin;
alter table halloween_private.campaigns add column if not exists last_sync_at timestamptz;
alter table halloween_private.campaigns add column if not exists sync_error text;
alter table halloween_private.tickets add column if not exists customer_id text;
alter table halloween_private.tickets add column if not exists sale_id uuid;
alter table halloween_private.tickets add column if not exists revoked_at timestamptz;
alter table halloween_private.tickets add column if not exists revoked_reason text;
alter table halloween_private.tickets alter column created_by drop not null;
create unique index if not exists halloween_ticket_sale on halloween_private.tickets(campaign_id,sale_id) where sale_id is not null;
create index if not exists halloween_ticket_customer on halloween_private.tickets(campaign_id,customer_id,created_at desc);
create table if not exists halloween_private.sale_windows (
 id bigint generated always as identity primary key,
 campaign_id text not null references halloween_private.campaigns(id),
 started_at timestamptz not null default clock_timestamp(), ended_at timestamptz
);
create unique index if not exists halloween_open_window on halloween_private.sale_windows(campaign_id) where ended_at is null;
alter table halloween_private.sale_windows enable row level security;
revoke all on halloween_private.sale_windows from public,anon,authenticated;
create or replace function halloween_private.activation_window() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.test_mode and new.active and not old.active then
  insert into halloween_private.sale_windows(campaign_id) values(new.id);
 elsif not new.active and old.active then
  update halloween_private.sale_windows set ended_at=clock_timestamp() where campaign_id=new.id and ended_at is null;
 end if;
 return new;
end $$;
create trigger halloween_activation_window after update of active on halloween_private.campaigns for each row execute function halloween_private.activation_window();

-- Trusted helper: only the worker/DB owner can call it. Caller holds campaign lock.
-- JSON boundary allows transactional synthetic tests without creating financial sales.
create function halloween_private.capture_sale(p_campaign text,p_sale jsonb,p_customer text) returns uuid language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns; v_id uuid; v_token text; v_time timestamptz;
begin
 select * into c from halloween_private.campaigns where id=p_campaign;
 if not found or not c.active or not c.stock_confirmed then return null; end if;
 v_time:=(p_sale->>'created_at')::timestamptz;
 if p_sale->>'status' is distinct from 'concluida' or coalesce((p_sale->>'total')::numeric,0)<200
 or coalesce((p_sale->>'uso_interno')::boolean,false) or p_sale->>'ml_order_id' is not null
 or nullif(btrim(p_sale->>'pessoa_id'),'') is null or nullif(btrim(p_customer),'') is null
 or v_time is null or v_time<=clock_timestamp()-interval '48 hours'
 or not exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and v_time>=w.started_at and (w.ended_at is null or v_time<w.ended_at)) then return null; end if;
 select id into v_id from halloween_private.tickets where campaign_id=c.id and sale_id=(p_sale->>'id')::uuid;
 if found then return v_id; end if;
 v_id:=gen_random_uuid();
 v_token:=encode(extensions.hmac(convert_to(v_id::text,'UTF8'),c.secret,'sha256'),'hex');
 insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,customer_id,sale_id,amount_cents,token_hash,created_at,expires_at,created_by)
 values(v_id,c.id,'VENDA'||replace(p_sale->>'id','-',''),left(btrim(p_customer),80),p_sale->>'pessoa_id',(p_sale->>'id')::uuid,
 least(round((p_sale->>'total')::numeric*100),2147483647)::integer,encode(extensions.digest(v_token,'sha256'),'hex'),v_time,v_time+interval '48 hours',(p_sale->>'vendedor_id')::uuid);
 insert into halloween_private.audit(campaign_id,action,object_id) values(c.id,'sale_auto_issue',v_id::text);
 return v_id;
end $$;

create function halloween_private.sale_valid(p_ticket uuid) returns boolean language sql stable security definer set search_path='' as $$
 select t.revoked_at is null and (t.sale_id is null or c.test_mode or exists(
  select 1 from public.vendas v where v.id=t.sale_id and v.status='concluida' and v.total>=200
  and v.pessoa_id=t.customer_id and not coalesce(v.uso_interno,false) and v.ml_order_id is null))
 from halloween_private.tickets t join halloween_private.campaigns c on c.id=t.campaign_id where t.id=p_ticket
$$;

create function halloween_private.sync_sales() returns integer language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns; v record; n integer:=0;
begin
 -- ponytail: one minute worker, bounded per campaign; no locks/writes on checkout tables.
 for c in select * from halloween_private.campaigns where not test_mode for update skip locked loop
  begin
   update halloween_private.tickets t set revoked_at=clock_timestamp(),revoked_reason='Compra cancelada ou deixou de atender às regras.'
   where t.campaign_id=c.id and t.sale_id is not null and t.revoked_at is null and not halloween_private.sale_valid(t.id);
   with released as (
    update halloween_private.coupons r set released_at=clock_timestamp()
    from halloween_private.tickets t where r.ticket_id=t.id and t.campaign_id=c.id and t.revoked_at is not null
    and r.redeemed_at is null and r.released_at is null returning r.product_id
   ), counts as(select product_id,count(*)::integer qty from released group by product_id)
   update halloween_private.products p set remaining=p.remaining+x.qty from counts x where p.campaign_id=c.id and p.id=x.product_id;
   perform halloween_private.release_expired(c.id);
   if c.active and c.stock_confirmed then
    for v in select to_jsonb(s) sale,p.nome from public.vendas s join public.pessoas p on p.id=s.pessoa_id
     where s.status='concluida' and s.total>=200 and not coalesce(s.uso_interno,false) and s.ml_order_id is null
     and s.created_at>clock_timestamp()-interval '48 hours'
     and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and s.created_at>=w.started_at and (w.ended_at is null or s.created_at<w.ended_at))
     and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.sale_id=s.id)
     order by s.created_at limit 200 loop
      if halloween_private.capture_sale(c.id,v.sale,v.nome) is not null then n:=n+1; end if;
    end loop;
   end if;
   update halloween_private.campaigns set last_sync_at=clock_timestamp(),sync_error=null where id=c.id;
  exception when others then
   update halloween_private.campaigns set sync_error='Falha na conciliação. Solicite revisão à administração.' where id=c.id;
  end;
 end loop;
 return n;
end $$;

create function halloween_private.client_tickets(p_campaign text,p_customer text,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_data jsonb;
begin
 v_user:=halloween_private.require_staff();
 if p_offset<0 or p_offset>100000 then raise exception 'Página inválida.'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_data from (
 select t.id,t.customer,t.customer_id,t.purchase_ref,t.created_at,t.expires_at,t.amount_cents,
 case when not halloween_private.sale_valid(t.id) then 'revoked' when r.id is not null then 'used' when t.expires_at<=clock_timestamp() then 'expired' else 'available' end status,
 halloween_private.coupon_json(r.id) result,
 encode(extensions.hmac(convert_to(t.id::text,'UTF8'),c.secret,'sha256'),'hex') token
 from halloween_private.tickets t join halloween_private.campaigns c on c.id=t.campaign_id left join halloween_private.coupons r on r.ticket_id=t.id
 where t.campaign_id=p_campaign and coalesce(t.customer_id,'test:'||t.id::text)=p_customer
 order by t.created_at desc limit 50 offset p_offset)x;
 insert into halloween_private.audit(campaign_id,action,object_id,actor) values(p_campaign,'client_links_view',p_customer,v_user);
 return v_data;
end $$;
create function public.halloween_client_tickets(p_campaign text,p_customer text,p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select halloween_private.client_tickets(p_campaign,p_customer,p_offset) $$;
revoke all on function public.halloween_client_tickets(text,text,integer) from public,anon,authenticated;
grant execute on function public.halloween_client_tickets(text,text,integer) to authenticated;
revoke all on function halloween_private.activation_window(),halloween_private.capture_sale(text,jsonb,text),halloween_private.sale_valid(uuid),halloween_private.sync_sales(),halloween_private.client_tickets(text,text,integer) from public,anon,authenticated;
grant execute on function halloween_private.client_tickets(text,text,integer) to authenticated;

create or replace function halloween_private.ticket(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t halloween_private.tickets; r uuid; c halloween_private.campaigns;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Link de giro inválido.'; end if;
 select * into t from halloween_private.tickets where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Link de giro inválido.'; end if;
 select * into c from halloween_private.campaigns where id=t.campaign_id;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 return jsonb_build_object('campaign',halloween_private.catalog(c.id),'customer',t.customer,
  'expires_at',t.expires_at,'server_time',clock_timestamp(),
  'status',case when not halloween_private.sale_valid(t.id) then 'revoked' when r is not null then 'used' when t.expires_at<=clock_timestamp() then 'expired' when not c.active then 'paused' else 'available' end,
  'result',halloween_private.coupon_json(r));
end $$;

create or replace function halloween_private.spin(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t halloween_private.tickets; c halloween_private.campaigns; r uuid; p halloween_private.products; v_total integer; v_ticket double precision; v_now timestamptz;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Link de giro inválido.'; end if;
 select * into t from halloween_private.tickets where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Link de giro inválido.'; end if;
 if not halloween_private.sale_valid(t.id) then raise exception 'Este giro foi cancelado. Consulte a loja.'; end if;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 if r is not null then return halloween_private.coupon_json(r); end if;
 if t.expires_at<=clock_timestamp() then raise exception 'Seu prazo para girar terminou.'; end if;
 -- ponytail: serialize this small campaign; shard locks only if measured traffic requires it.
 select * into c from halloween_private.campaigns where id=t.campaign_id for update;
 select * into t from halloween_private.tickets where id=t.id for update;
 if not halloween_private.sale_valid(t.id) then raise exception 'Este giro foi cancelado. Consulte a loja.'; end if;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 if r is not null then return halloween_private.coupon_json(r); end if;
 v_now:=clock_timestamp();
 if t.expires_at<=v_now then raise exception 'Seu prazo para girar terminou.'; end if;
 if not c.active then raise exception 'A campanha está pausada.'; end if;
 perform halloween_private.release_expired(c.id);
 select coalesce(sum(weight),0)::integer into v_total from halloween_private.products where campaign_id=c.id and remaining>0 and weight>0;
 if v_total=0 then raise exception 'Ofertas esgotadas. Consulte a loja antes de o giro vencer.'; end if;
 v_ticket:=('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint/4294967296.0*v_total;
 for p in select * from halloween_private.products where campaign_id=c.id and remaining>0 and weight>0 order by id loop
  v_ticket:=v_ticket-p.weight;
  exit when v_ticket<0;
 end loop;
 update halloween_private.products set remaining=remaining-1 where campaign_id=c.id and id=p.id;
 insert into halloween_private.coupons(ticket_id,campaign_id,product_id,offer,code,created_at,expires_at)
 values(t.id,c.id,p.id,jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value),
 'TC-'||upper(encode(extensions.gen_random_bytes(12),'hex')),v_now,v_now+interval '48 hours') returning id into r;
 insert into halloween_private.audit(campaign_id,action,object_id) values(c.id,'spin',r::text);
 return halloween_private.coupon_json(r);
end $$;

create or replace function halloween_private.issue(p_campaign text,p_ref text,p_customer text,p_amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; t halloween_private.tickets; c halloween_private.campaigns; v_id uuid; v_token text; v_now timestamptz; v_ref text;
begin
 v_user:=halloween_private.require_staff();
 if not coalesce((select test_mode from halloween_private.campaigns where id=p_campaign),false) then raise exception 'Na campanha real, os giros são liberados automaticamente pelas vendas do Cloud.'; end if;
 if p_ref is null or length(btrim(p_ref)) not between 1 and 100 or p_customer is null or length(btrim(p_customer)) not between 1 and 80 or p_amount is null or p_amount<20000 or p_amount>100000000 then raise exception 'Informe compra, cliente e valor de pelo menos R$ 200.'; end if;
 v_ref:=regexp_replace(upper(btrim(p_ref)),'[^A-Z0-9]','','g');
 if length(v_ref)=0 then raise exception 'Informe um identificador válido para a compra.'; end if;
 select * into c from halloween_private.campaigns where id=p_campaign for update;
 if not found then raise exception 'Campanha não encontrada.'; end if;
 select * into t from halloween_private.tickets where campaign_id=c.id and purchase_ref=v_ref;
 if found then
  if t.customer<>btrim(p_customer) or t.amount_cents<>p_amount then raise exception 'Esta compra já foi cadastrada com outros dados.'; end if;
  insert into halloween_private.audit(campaign_id,action,object_id,actor) values(c.id,'issue_replay',t.id::text,v_user);
 else
  if not c.active then raise exception 'Ative a campanha antes de liberar giros.'; end if;
  v_id:=gen_random_uuid(); v_now:=clock_timestamp();
  v_token:=encode(extensions.hmac(convert_to(v_id::text,'UTF8'),c.secret,'sha256'),'hex');
  insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,amount_cents,token_hash,created_at,expires_at,created_by)
  values(v_id,c.id,v_ref,btrim(p_customer),p_amount,encode(extensions.digest(v_token,'sha256'),'hex'),v_now,v_now+interval '48 hours',v_user) returning * into t;
  insert into halloween_private.audit(campaign_id,action,object_id,actor) values(c.id,'issue',t.id::text,v_user);
 end if;
 v_token:=encode(extensions.hmac(convert_to(t.id::text,'UTF8'),c.secret,'sha256'),'hex');
 return jsonb_build_object('id',t.id,'token',v_token,'expires_at',t.expires_at,'customer',t.customer,'test_mode',c.test_mode);
end $$;

create or replace function halloween_private.admin_state(p_campaign text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns;
begin
 perform halloween_private.require_staff();
 select * into c from halloween_private.campaigns where id=p_campaign for update;
 if not found then raise exception 'Campanha não encontrada.'; end if;
 perform halloween_private.release_expired(c.id);
 return jsonb_build_object('campaign',halloween_private.catalog(c.id),'stock_confirmed',c.stock_confirmed,
 'last_sync_at',c.last_sync_at,'sync_error',c.sync_error,
 'clients',(select coalesce(jsonb_agg(to_jsonb(x) order by x.latest desc),'[]'::jsonb) from (
 select coalesce(t.customer_id,'test:'||t.id::text) client_key,max(t.customer) customer,count(*) total,
 count(*) filter(where t.revoked_at is null and r.id is null and t.expires_at>clock_timestamp()) available,
 count(*) filter(where t.revoked_at is null and r.id is not null) used,
 count(*) filter(where t.revoked_at is null and r.id is null and t.expires_at<=clock_timestamp()) expired,
 count(*) filter(where t.revoked_at is not null) revoked,max(t.created_at) latest
 from halloween_private.tickets t left join halloween_private.coupons r on r.ticket_id=t.id where t.campaign_id=c.id
 group by coalesce(t.customer_id,'test:'||t.id::text) order by latest desc limit 500)x),
 'pending',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select s.numero,s.created_at,'Identifique o cliente na venda do Cloud.' reason from public.vendas s
 where not c.test_mode and c.active and s.status='concluida' and s.total>=200 and not coalesce(s.uso_interno,false) and s.ml_order_id is null
 and s.created_at>clock_timestamp()-interval '48 hours' and not exists(select 1 from public.pessoas p where p.id=s.pessoa_id and nullif(btrim(p.nome),'') is not null)
 and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and s.created_at>=w.started_at and (w.ended_at is null or s.created_at<w.ended_at))
 order by s.created_at desc limit 100)x),
 'products',(select jsonb_agg(to_jsonb(p) order by p.id) from halloween_private.products p where campaign_id=c.id),
 'tickets',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from (select id,purchase_ref,customer,amount_cents,created_at,expires_at from halloween_private.tickets where campaign_id=c.id order by created_at desc limit 100)t),
 'results',(select coalesce(jsonb_agg(jsonb_build_object('customer',t.customer,'purchase_ref',t.purchase_ref,'result',halloween_private.coupon_json(r.id)) order by r.created_at desc),'[]'::jsonb)
 from (select * from halloween_private.coupons where campaign_id=c.id order by created_at desc limit 100)r join halloween_private.tickets t on t.id=r.ticket_id),
 'metrics',jsonb_build_object('tickets',(select count(*) from halloween_private.tickets where campaign_id=c.id),'spins',(select count(*) from halloween_private.coupons where campaign_id=c.id),'redeemed',(select count(*) from halloween_private.coupons where campaign_id=c.id and redeemed_at is not null)));
end $$;

create or replace function halloween_private.redeem(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; r halloween_private.coupons;
begin
 v_user:=halloween_private.require_staff();
 select * into r from halloween_private.coupons where code=upper(btrim(p_code));
 if not found then raise exception 'Código não encontrado.'; end if;
 -- Serialize redemption against cancellation without changing the financial sale.
 perform 1 from public.vendas v join halloween_private.tickets t on t.sale_id=v.id where t.id=r.ticket_id for share of v;
 if not halloween_private.sale_valid(r.ticket_id) then raise exception 'Compra cancelada ou inelegível. Vale bloqueado.'; end if;
 perform 1 from halloween_private.campaigns where id=r.campaign_id for update;
 select * into r from halloween_private.coupons where id=r.id for update;
 if r.redeemed_at is not null then return halloween_private.coupon_json(r.id); end if;
 if r.expires_at<=clock_timestamp() or r.released_at is not null then raise exception 'Este vale venceu e não pode ser resgatado.'; end if;
 update halloween_private.coupons set redeemed_at=clock_timestamp(),redeemed_by=v_user where id=r.id;
 insert into halloween_private.audit(campaign_id,action,object_id,actor) values(r.campaign_id,'redeem',r.id::text,v_user);
 return halloween_private.coupon_json(r.id);
end $$;

create or replace function halloween_private.coupon_json(p_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'code',r.code,'offer',r.offer,'created_at',r.created_at,'expires_at',r.expires_at,
 'redeemed_at',r.redeemed_at,'status',case when not halloween_private.sale_valid(r.ticket_id) then 'revoked' when r.redeemed_at is not null then 'redeemed' when r.released_at is not null or r.expires_at<=clock_timestamp() then 'expired' else 'available' end)
 from halloween_private.coupons r where r.id=p_id
$$;
notify pgrst,'reload schema';
commit;
