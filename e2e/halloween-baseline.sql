-- Campaign-only objects. No ERP, payment, sale or inventory tables are changed.
begin;
create schema if not exists halloween_private;
revoke all on schema halloween_private from public, anon, authenticated;

create table halloween_private.campaigns (
 id text primary key, title text not null, active boolean not null default false,
 test_mode boolean not null default false, stock_confirmed boolean not null default false,
 secret bytea not null default extensions.gen_random_bytes(32)
);
create table halloween_private.staff (
 user_id uuid primary key, enabled boolean not null default true
);
create table halloween_private.products (
 campaign_id text not null references halloween_private.campaigns(id),
 id integer not null, name text not null,
 benefit_type text not null check(benefit_type in ('percent','price')),
 benefit_value integer not null check(benefit_value>0),
 weight integer not null check(weight between 0 and 10000),
 quantity integer not null check(quantity>=0),
 remaining integer not null check(remaining>=0 and remaining<=quantity),
 primary key(campaign_id,id),
 check(benefit_type<>'percent' or benefit_value<=100)
);
create table halloween_private.tickets (
 id uuid primary key default gen_random_uuid(),
 campaign_id text not null references halloween_private.campaigns(id),
 purchase_ref text not null check(length(purchase_ref) between 1 and 100),
 customer text not null check(length(customer) between 1 and 80),
 amount_cents integer not null check(amount_cents>=20000),
 token_hash text not null unique,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 created_by uuid not null,
 unique(campaign_id,purchase_ref)
);
create table halloween_private.coupons (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null unique references halloween_private.tickets(id),
 campaign_id text not null, product_id integer not null,
 offer jsonb not null, code text not null unique,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 redeemed_at timestamptz, redeemed_by uuid, released_at timestamptz,
 foreign key(campaign_id,product_id) references halloween_private.products(campaign_id,id),
 check(redeemed_at is null or released_at is null)
);
create index on halloween_private.coupons(campaign_id,expires_at) where redeemed_at is null and released_at is null;
create table halloween_private.audit (
 id bigint generated always as identity primary key,
 campaign_id text not null references halloween_private.campaigns(id),
 action text not null, object_id text, actor uuid, created_at timestamptz not null default clock_timestamp()
);
alter table halloween_private.campaigns enable row level security;
alter table halloween_private.staff enable row level security;
alter table halloween_private.products enable row level security;
alter table halloween_private.tickets enable row level security;
alter table halloween_private.coupons enable row level security;
alter table halloween_private.audit enable row level security;
revoke all on all tables in schema halloween_private from public,anon,authenticated;
revoke all on all sequences in schema halloween_private from public,anon,authenticated;

insert into halloween_private.campaigns(id,title,test_mode,active,stock_confirmed) values
 ('halloween-2026','Caldeirão da Sorte — Halloween TECNOCELL',false,false,false),
 ('halloween-2026-test','Homologação — Halloween TECNOCELL',true,true,true);

insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,quantity,remaining)
select c.id,p.id,p.name,p.kind,p.value,p.weight,
 case when c.test_mode then p.qty else 0 end,case when c.test_mode then p.qty else 0 end
from halloween_private.campaigns c cross join (values
 (1,'Fone Kapbom KA-960','percent',15,5,10),
 (2,'Fone Kapbom KA-980 Gatinho','percent',20,5,10),
 (3,'Caixa de som Kapbom KA-8005','percent',20,5,10),
 (4,'Smart Watch Basike S10 Ultra+','percent',15,2,10),
 (5,'Smartwatch Kapbom KA-9975 49mm','percent',20,2,10),
 (6,'Repetidor Wi-Fi Kapbom KA-X338 G','percent',15,5,10),
 (7,'Fone Kapbom KA-P9 B','percent',18,5,10),
 (8,'UniTV Mini Smart TV Box V12','percent',15,1,1),
 (9,'Carregador Basike MD-CAR271A','percent',18,5,10),
 (10,'Fone Basike TWS BA-FON6694','percent',18,2,10),
 (11,'Copão térmico WU-613 1200ml','percent',10,2,10),
 (12,'Carregador Mechanic iCharge8Pro','price',18000,1,1),
 (13,'Cabo de inicialização Sunshine SS-905D','price',13500,1,1)
) as p(id,name,kind,value,weight,qty);

-- Private privileged implementations are not exposed by the REST schema.
create function halloween_private.require_staff() returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or not exists(select 1 from halloween_private.staff s join public.perfis p on p.id=s.user_id where s.user_id=v_user and s.enabled and p.ativo is distinct from false)
 or not exists(select 1 from auth.sessions s where s.user_id=v_user and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception 'Acesso restrito à equipe autorizada.' using errcode='42501';
 end if;
 return v_user;
end $$;

-- Snapshot of the current active Cloud team, as authorized by the owner.
insert into halloween_private.staff(user_id)
select p.id from public.perfis p join auth.users u on u.id=p.id
where p.ativo is distinct from false and (p.is_master or cardinality(p.permissoes)>0 or p.cargo_id is not null)
on conflict(user_id) do nothing;

-- Caller already holds the campaign row lock. Reclaim only expired, unredeemed reservations.
create function halloween_private.release_expired(p_campaign text) returns void language plpgsql security definer set search_path='' as $$
begin
 with released as (
  update halloween_private.coupons set released_at=clock_timestamp()
  where campaign_id=p_campaign and redeemed_at is null and released_at is null and expires_at<=clock_timestamp()
  returning product_id
 ), counts as (select product_id,count(*)::integer as qty from released group by product_id)
 update halloween_private.products p set remaining=p.remaining+c.qty
 from counts c where p.campaign_id=p_campaign and p.id=c.product_id;
end $$;

create function halloween_private.coupon_json(p_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'code',r.code,'offer',r.offer,'created_at',r.created_at,'expires_at',r.expires_at,
 'redeemed_at',r.redeemed_at,'status',case when r.redeemed_at is not null then 'redeemed' when r.expires_at<=clock_timestamp() then 'expired' else 'available' end)
 from halloween_private.coupons r where r.id=p_id
$$;

create function halloween_private.catalog(p_campaign text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'title',c.title,'active',c.active,'test_mode',c.test_mode,'server_time',clock_timestamp(),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value) order by p.id),'[]'::jsonb)
 from halloween_private.products p where p.campaign_id=c.id)) from halloween_private.campaigns c where c.id=p_campaign
$$;

create function halloween_private.ticket(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t halloween_private.tickets; r uuid; c halloween_private.campaigns;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Link de giro inválido.'; end if;
 select * into t from halloween_private.tickets where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Link de giro inválido.'; end if;
 select * into c from halloween_private.campaigns where id=t.campaign_id;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 return jsonb_build_object('campaign',halloween_private.catalog(c.id),'customer',t.customer,
  'expires_at',t.expires_at,'server_time',clock_timestamp(),
  'status',case when r is not null then 'used' when t.expires_at<=clock_timestamp() then 'expired' when not c.active then 'paused' else 'available' end,
  'result',halloween_private.coupon_json(r));
end $$;

create function halloween_private.spin(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t halloween_private.tickets; c halloween_private.campaigns; r uuid; p halloween_private.products; v_total integer; v_ticket double precision; v_now timestamptz;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Link de giro inválido.'; end if;
 select * into t from halloween_private.tickets where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Link de giro inválido.'; end if;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 if r is not null then return halloween_private.coupon_json(r); end if;
 if t.expires_at<=clock_timestamp() then raise exception 'Seu prazo para girar terminou.'; end if;
 -- ponytail: serialize this small campaign; shard locks only if measured traffic requires it.
 select * into c from halloween_private.campaigns where id=t.campaign_id for update;
 select * into t from halloween_private.tickets where id=t.id for update;
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

create function halloween_private.issue(p_campaign text,p_ref text,p_customer text,p_amount integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; t halloween_private.tickets; c halloween_private.campaigns; v_id uuid; v_token text; v_now timestamptz; v_ref text;
begin
 v_user:=halloween_private.require_staff();
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

create function halloween_private.admin_state(p_campaign text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns;
begin
 perform halloween_private.require_staff();
 select * into c from halloween_private.campaigns where id=p_campaign for update;
 if not found then raise exception 'Campanha não encontrada.'; end if;
 perform halloween_private.release_expired(c.id);
 return jsonb_build_object('campaign',halloween_private.catalog(c.id),'stock_confirmed',c.stock_confirmed,
 'products',(select jsonb_agg(to_jsonb(p) order by p.id) from halloween_private.products p where campaign_id=c.id),
 'tickets',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from (select id,purchase_ref,customer,amount_cents,created_at,expires_at from halloween_private.tickets where campaign_id=c.id order by created_at desc limit 100)t),
 'results',(select coalesce(jsonb_agg(jsonb_build_object('customer',t.customer,'purchase_ref',t.purchase_ref,'result',halloween_private.coupon_json(r.id)) order by r.created_at desc),'[]'::jsonb)
 from (select * from halloween_private.coupons where campaign_id=c.id order by created_at desc limit 100)r join halloween_private.tickets t on t.id=r.ticket_id),
 'metrics',jsonb_build_object('tickets',(select count(*) from halloween_private.tickets where campaign_id=c.id),'spins',(select count(*) from halloween_private.coupons where campaign_id=c.id),'redeemed',(select count(*) from halloween_private.coupons where campaign_id=c.id and redeemed_at is not null)));
end $$;

create function halloween_private.lookup(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r halloween_private.coupons; t halloween_private.tickets; v_test boolean;
begin
 perform halloween_private.require_staff();
 select * into r from halloween_private.coupons where code=upper(btrim(p_code));
 if not found then raise exception 'Código não encontrado.'; end if;
 select * into t from halloween_private.tickets where id=r.ticket_id;
 select test_mode into v_test from halloween_private.campaigns where id=r.campaign_id;
 return jsonb_build_object('customer',t.customer,'purchase_ref',t.purchase_ref,'test_mode',v_test,'result',halloween_private.coupon_json(r.id));
end $$;

create function halloween_private.redeem(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; r halloween_private.coupons;
begin
 v_user:=halloween_private.require_staff();
 select * into r from halloween_private.coupons where code=upper(btrim(p_code));
 if not found then raise exception 'Código não encontrado.'; end if;
 perform 1 from halloween_private.campaigns where id=r.campaign_id for update;
 select * into r from halloween_private.coupons where id=r.id for update;
 if r.redeemed_at is not null then return halloween_private.coupon_json(r.id); end if;
 if r.expires_at<=clock_timestamp() or r.released_at is not null then raise exception 'Este vale venceu e não pode ser resgatado.'; end if;
 update halloween_private.coupons set redeemed_at=clock_timestamp(),redeemed_by=v_user where id=r.id;
 insert into halloween_private.audit(campaign_id,action,object_id,actor) values(r.campaign_id,'redeem',r.id::text,v_user);
 return halloween_private.coupon_json(r.id);
end $$;

create function halloween_private.configure(p_campaign text,p_products jsonb,p_confirm boolean,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid; c halloween_private.campaigns; e jsonb; p halloween_private.products; v_qty integer; v_weight integer;
begin
 v_user:=halloween_private.require_staff();
 select * into c from halloween_private.campaigns where id=p_campaign for update;
 if not found then raise exception 'Campanha não encontrada.'; end if;
 if jsonb_typeof(p_products) is distinct from 'array' or jsonb_array_length(p_products)<>(select count(*) from halloween_private.products where campaign_id=c.id) then raise exception 'Envie a configuração de todos os produtos.'; end if;
 if (select count(distinct (x->>'id')::integer) from jsonb_array_elements(p_products)x)<>jsonb_array_length(p_products) then raise exception 'Produtos duplicados.'; end if;
 perform halloween_private.release_expired(c.id);
 for e in select * from jsonb_array_elements(p_products) loop
  select * into p from halloween_private.products where campaign_id=c.id and id=(e->>'id')::integer;
  if not found or (e->>'quantity') !~ '^\d{1,6}$' or (e->>'weight') !~ '^\d{1,5}$' or e->>'quantity' is null or e->>'weight' is null then raise exception 'Configuração inválida.'; end if;
  v_qty:=(e->>'quantity')::integer; v_weight:=(e->>'weight')::integer;
  if v_qty<p.quantity-p.remaining or v_qty>100000 or v_weight>10000 then raise exception 'Quantidade inferior aos vales reservados/resgatados, ou valor fora do limite.'; end if;
  update halloween_private.products set quantity=v_qty,remaining=remaining+v_qty-quantity,weight=v_weight where campaign_id=c.id and id=p.id;
 end loop;
 if p_active and not coalesce(p_confirm,false) then raise exception 'Confirme as quantidades reais antes de ativar.'; end if;
 if p_active and not exists(select 1 from halloween_private.products where campaign_id=c.id and remaining>0 and weight>0) then raise exception 'Cadastre estoque e pesos antes de ativar.'; end if;
 update halloween_private.campaigns set active=coalesce(p_active,false),stock_confirmed=coalesce(p_confirm,false) where id=c.id;
 insert into halloween_private.audit(campaign_id,action,actor) values(c.id,'configure',v_user);
 return halloween_private.admin_state(c.id);
end $$;

revoke all on all functions in schema halloween_private from public,anon,authenticated;
grant usage on schema halloween_private to anon,authenticated;
grant execute on function halloween_private.catalog(text),halloween_private.ticket(text),halloween_private.spin(text) to anon,authenticated;
grant execute on function halloween_private.issue(text,text,text,integer),halloween_private.admin_state(text),halloween_private.lookup(text),halloween_private.redeem(text),halloween_private.configure(text,jsonb,boolean,boolean) to authenticated;

-- Only invoker wrappers are in the exposed schema; no table is exposed.
create function public.halloween_catalog(p_campaign text default 'halloween-2026') returns jsonb language sql security invoker set search_path='' as $$select halloween_private.catalog(p_campaign)$$;
create function public.halloween_ticket(p_token text) returns jsonb language sql security invoker set search_path='' as $$select halloween_private.ticket(p_token)$$;
create function public.halloween_spin(p_token text) returns jsonb language sql security invoker set search_path='' as $$select halloween_private.spin(p_token)$$;
create function public.halloween_issue(p_campaign text,p_ref text,p_customer text,p_amount integer) returns jsonb language sql security invoker set search_path='' as $$select halloween_private.issue(p_campaign,p_ref,p_customer,p_amount)$$;
create function public.halloween_admin_state(p_campaign text) returns jsonb language sql security invoker set search_path='' as $$select halloween_private.admin_state(p_campaign)$$;
create function public.halloween_lookup(p_code text) returns jsonb language sql security invoker set search_path='' as $$select halloween_private.lookup(p_code)$$;
create function public.halloween_redeem(p_code text) returns jsonb language sql security invoker set search_path='' as $$select halloween_private.redeem(p_code)$$;
create function public.halloween_configure(p_campaign text,p_products jsonb,p_confirm boolean,p_active boolean) returns jsonb language sql security invoker set search_path='' as $$select halloween_private.configure(p_campaign,p_products,p_confirm,p_active)$$;
revoke all on function public.halloween_catalog(text),public.halloween_ticket(text),public.halloween_spin(text),public.halloween_issue(text,text,text,integer),public.halloween_admin_state(text),public.halloween_lookup(text),public.halloween_redeem(text),public.halloween_configure(text,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.halloween_catalog(text),public.halloween_ticket(text),public.halloween_spin(text) to anon,authenticated;
grant execute on function public.halloween_issue(text,text,text,integer),public.halloween_admin_state(text),public.halloween_lookup(text),public.halloween_redeem(text),public.halloween_configure(text,jsonb,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
