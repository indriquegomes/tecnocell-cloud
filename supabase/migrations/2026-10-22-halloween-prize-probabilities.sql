-- Percentages supplied by the owner are win probabilities, not discounts.
begin;
do $$begin if exists(select 1 from halloween_private.campaigns where id='halloween-2026' and active) then raise exception 'Pause a campanha real antes de corrigir as regras.'; end if; end $$;
-- 100% discount represents a free product without changing existing coupon snapshots.
update halloween_private.products p set benefit_type=case when p.id<=11 then 'percent' else 'price' end,benefit_value=case when p.id<=11 then 100 when p.id=12 then 18000 else 13500 end,weight=w.bps
from (values (1,807),(2,1076),(3,1076),(4,807),(5,1076),(6,807),(7,969),(8,807),(9,969),(10,968),(11,538),(12,50),(13,50))w(id,bps)
where p.campaign_id in ('halloween-2026','halloween-2026-test') and p.id=w.id;

-- Rare entries keep their absolute 0.5%; only the common pool is redistributed.
-- Without common stock, no draw is possible and the ticket is not consumed.
create or replace function halloween_private.draw_pool(p_campaign text)
returns table(product_id integer,chance_bps numeric) language sql stable security definer set search_path='' as $$
 with available as (select id,weight from halloween_private.products where campaign_id=p_campaign and remaining>0 and weight>0),
 totals as (select coalesce(sum(weight) filter(where id not in(12,13)),0)::numeric common,coalesce(sum(weight) filter(where id in(12,13)),0)::numeric rare from available)
 select a.id,case when a.id in(12,13) then a.weight::numeric else a.weight*(10000-t.rare)/nullif(t.common,0) end
 from available a cross join totals t where t.common>0 and t.rare<10000
$$;
revoke all on function halloween_private.draw_pool(text) from public,anon,authenticated;

create or replace function halloween_private.catalog(p_campaign text) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'title',c.title,'active',c.active,'test_mode',c.test_mode,'server_time',clock_timestamp(),
 'can_spin',exists(select 1 from halloween_private.draw_pool(c.id)),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value,'chance_base',p.weight/100.0,'chance_current',coalesce(d.chance_bps/100.0,0),'available',p.remaining>0 and p.weight>0) order by p.id),'[]'::jsonb)
 from halloween_private.products p left join halloween_private.draw_pool(c.id)d on d.product_id=p.id where p.campaign_id=c.id)) from halloween_private.campaigns c where c.id=p_campaign
$$;

create or replace function halloween_private.spin(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t halloween_private.tickets; c halloween_private.campaigns; r uuid; p halloween_private.products; v_total numeric; v_pick record; v_ticket double precision; v_now timestamptz;
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
 select coalesce(sum(chance_bps),0) into v_total from halloween_private.draw_pool(c.id);
 if v_total=0 then raise exception 'Prêmios comuns esgotados. Aguarde reposição na loja; as chances dos raros não aumentam.'; end if;
 v_ticket:=('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint/4294967296.0*v_total;
 for v_pick in select * from halloween_private.draw_pool(c.id) order by product_id loop
  v_ticket:=v_ticket-v_pick.chance_bps;
  if v_ticket<0 then
   select * into p from halloween_private.products where campaign_id=c.id and id=v_pick.product_id;
   exit;
  end if;
 end loop;
 update halloween_private.products set remaining=remaining-1 where campaign_id=c.id and id=p.id;
 insert into halloween_private.coupons(ticket_id,campaign_id,product_id,offer,code,created_at,expires_at)
 values(t.id,c.id,p.id,jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value),
 'TC-'||upper(encode(extensions.gen_random_bytes(12),'hex')),v_now,v_now+interval '48 hours') returning id into r;
 insert into halloween_private.audit(campaign_id,action,object_id) values(c.id,'spin',r::text);
 return halloween_private.coupon_json(r);
end $$;

create or replace function halloween_private.configure(p_campaign text,p_products jsonb,p_confirm boolean,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if (e->>'id')::integer in (12,13) and (e->>'weight')::integer<>50 then raise exception 'Os dois raros mantêm chance fixa de 0,5 por cento.'; end if;
  v_qty:=(e->>'quantity')::integer; v_weight:=(e->>'weight')::integer;
  if v_qty<p.quantity-p.remaining or v_qty>100000 or v_weight>10000 then raise exception 'Quantidade inferior aos vales reservados/resgatados, ou valor fora do limite.'; end if;
  update halloween_private.products set quantity=v_qty,remaining=remaining+v_qty-quantity,weight=v_weight where campaign_id=c.id and id=p.id;
 end loop;
 if (select sum(weight) from halloween_private.products where campaign_id=c.id)<>10000 then raise exception 'As chances base devem somar 100 por cento.'; end if;
 if p_active and not coalesce(p_confirm,false) then raise exception 'Confirme as quantidades reais antes de ativar.'; end if;
 if p_active and not exists(select 1 from halloween_private.draw_pool(c.id)) then raise exception 'Cadastre estoque e pesos antes de ativar.'; end if;
 update halloween_private.campaigns set active=coalesce(p_active,false),stock_confirmed=coalesce(p_confirm,false) where id=c.id;
 insert into halloween_private.audit(campaign_id,action,actor) values(c.id,'configure',v_user);
 return halloween_private.admin_state(c.id);
end $$;

insert into halloween_private.audit(campaign_id,action) select id,'probability_rules_corrected_20261022' from halloween_private.campaigns where id in('halloween-2026','halloween-2026-test');
notify pgrst,'reload schema';
commit;
