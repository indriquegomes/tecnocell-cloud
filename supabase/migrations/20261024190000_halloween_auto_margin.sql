-- Automatic, explicitly selected PDV attribution. Never classifies historical sales.
begin;
set local lock_timeout='3s';
create table halloween_private.margin_rules(code text primary key,rule_id text unique not null,percent numeric not null,version integer not null default 1);
insert into halloween_private.margin_rules(code,rule_id,percent) values
('03535','halloween-2026:1',15),('12451','halloween-2026:2',20),('12457','halloween-2026:3',20),('06483','halloween-2026:4',15),('12443','halloween-2026:5',20),('12454','halloween-2026:6',15),('12445','halloween-2026:7',18),('11799','halloween-2026:8',15),('12464','halloween-2026:9',18),('03393','halloween-2026:10',18),('12437','halloween-2026:11',10);
create table halloween_private.margin_operations(operation_id uuid primary key,payload jsonb not null,result jsonb);
create table halloween_private.margin_items(campaign_id text not null references halloween_private.campaigns(id),sale_id uuid not null references public.vendas(id),item_id uuid not null references public.itens_venda(id),store_id uuid not null references public.lojas(id),product_id text not null,rule_id text not null,version integer not null,quantity numeric not null check(quantity>0),revenue numeric(14,2) not null,unit_cost numeric,created_at timestamptz not null default clock_timestamp(),primary key(campaign_id,item_id));
create table halloween_private.margin_stores(campaign_id text not null references halloween_private.campaigns(id),store_id uuid not null references public.lojas(id),total numeric(14,2) not null default 0,pending integer not null default 0,unlocked_at timestamptz,unlocked_margin numeric,last_sync_at timestamptz,primary key(campaign_id,store_id));
create table halloween_private.margin_cost_audit(id bigint generated always as identity primary key,campaign_id text not null,item_id uuid not null,actor uuid not null,old_cost numeric,new_cost numeric not null,reason text not null,created_at timestamptz not null default clock_timestamp());
create function halloween_private.margin_window(p_campaign text)returns boolean language sql stable security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
select coalesce((select c.active and (c.starts_at is null or clock_timestamp()>=c.starts_at)and(c.ends_at is null or clock_timestamp()<c.ends_at+interval '48 hours' or exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.revoked_at is null and t.expires_at>clock_timestamp())or exists(select 1 from halloween_private.coupons r where r.campaign_id=c.id and r.voided_at is null and r.redeemed_at is null and r.released_at is null and r.expires_at>clock_timestamp()))from halloween_private.campaigns c where c.id=p_campaign),false)
$$;
create function public.halloween_pdv_rules(p_campaign text default 'halloween-2026')returns jsonb language sql stable security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'rule_id',r.rule_id,'campaign_id',p_campaign,'percent',r.percent,'version',r.version)),'[]')from public.produtos p join halloween_private.margin_rules r on p.codigo=r.code where p_campaign='halloween-2026' and halloween_private.margin_window(p_campaign)and p.ativo and (select count(*)from public.produtos z where z.codigo=r.code and z.ativo)=1
$$;
-- Revenue and cost are reversed from the immutable original cents, never current price/cost.
create function halloween_private.margin_effective(p_campaign text)returns table(sale_id uuid,item_id uuid,store_id uuid,product_id text,quantity numeric,revenue numeric,cost numeric,margin numeric,pending boolean)language sql stable security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
with source as(select m.*,v.status,
coalesce((select sum(i.quantidade)from public.devolucoes d join public.itens_devolucao i on i.devolucao_id=d.id where d.venda_id=m.sale_id and d.status='concluida'and i.produto_id=m.product_id),0) returned,
exists(select 1 from public.devolucoes d where d.venda_id=m.sale_id and d.status='concluida'and not exists(select 1 from public.itens_devolucao i where i.devolucao_id=d.id)) unknown_return
from halloween_private.margin_items m join public.vendas v on v.id=m.sale_id where m.campaign_id=p_campaign),amounts as(select *,case when status in('cancelada','cancelado') then 0 else greatest(0,quantity-returned)end qty from source),net as(select *,case when qty=0 then 0 else revenue-round(revenue*(quantity-qty)/quantity,2)end rev,case when qty=0 then 0 else round(unit_cost*quantity,2)-round(round(unit_cost*quantity,2)*(quantity-qty)/quantity,2)end cmv from amounts)
select sale_id,item_id,store_id,product_id,qty,rev,cmv,rev-cmv,(unit_cost is null or unit_cost<=0 or returned>quantity or returned<0 or unknown_return or status not in('concluida','cancelada','cancelado')or(status not in('cancelada','cancelado')and not halloween_private.sale_paid(sale_id)))from net
$$;
create function halloween_private.margin_reconcile(p_campaign text)returns void language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
begin
 perform pg_advisory_xact_lock(hashtext('halloween-margin:'||p_campaign));
 insert into halloween_private.margin_stores(campaign_id,store_id,total,pending,last_sync_at)
 select p_campaign,l.id,coalesce(sum(e.margin)filter(where not e.pending),0),count(e.item_id)filter(where e.pending),clock_timestamp()from public.lojas l left join halloween_private.margin_effective(p_campaign)e on e.store_id=l.id group by l.id
 on conflict(campaign_id,store_id)do update set total=excluded.total,pending=excluded.pending,last_sync_at=excluded.last_sync_at;
 update halloween_private.margin_stores set unlocked_at=clock_timestamp(),unlocked_margin=total where campaign_id=p_campaign and unlocked_at is null and total>=700 and pending=0;
end $$;
create function public.halloween_margin_reconcile(p_campaign text)returns void language sql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$select halloween_private.margin_reconcile(p_campaign)$$;
create function public.finalizar_venda_halloween(p_itens jsonb,p_pagamentos jsonb,p_pessoa_id text,p_desconto numeric,p_observacoes text,p_deposito_id text,p_series jsonb,p_vendedor_id uuid,p_vendedor_nome text,p_credito_valor numeric,p_tipo_entrega text,p_endereco_entrega text,p_operation uuid,p_tabela_id text)returns jsonb language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
#variable_conflict use_column
declare payload jsonb; prior halloween_private.margin_operations; x jsonb; rule halloween_private.margin_rules; product public.produtos; base numeric; store uuid; v_result jsonb; sid uuid; selected integer:=0;
begin
 if p_operation is null then raise exception 'Operação obrigatória';end if;
 payload:=jsonb_build_array(p_itens,p_pagamentos,p_pessoa_id,p_desconto,p_observacoes,p_deposito_id,p_series,p_vendedor_id,p_vendedor_nome,p_credito_valor,p_tipo_entrega,p_endereco_entrega,p_tabela_id);
 insert into halloween_private.margin_operations(operation_id,payload)values(p_operation,payload)on conflict do nothing;
 select * into strict prior from halloween_private.margin_operations where operation_id=p_operation for update;
 if prior.payload<>payload then raise exception 'Operação reutilizada com dados diferentes';end if;
 if prior.result is not null then return prior.result||jsonb_build_object('jaExistia',true,'vendedor_nome',prior.payload->8);end if;
 if jsonb_typeof(p_itens)<>'array'or jsonb_array_length(p_itens)=0 then raise exception 'Itens obrigatórios';end if;
 if exists(select 1 from jsonb_array_elements(p_itens)x group by x->>'produto_id'having count(*)>1)then raise exception 'Produto repetido';end if;
 select d.loja_id into store from public.depositos d join public.lojas l on l.id=d.loja_id and l.ativa where d.id=p_deposito_id;
 for x in select value from jsonb_array_elements(p_itens)loop
 if nullif(x->>'halloween_rule_id','')is not null then
 selected:=selected+1;
 if store is null or not halloween_private.margin_window('halloween-2026')then raise exception 'Halloween indisponível para esta loja/data';end if;
 select * into product from public.produtos where id=x->>'produto_id'and ativo for share;
 select * into rule from halloween_private.margin_rules where rule_id=x->>'halloween_rule_id'and code=product.codigo and version=(x->>'halloween_version')::integer;
 if not found or (select count(*)from public.produtos where codigo=rule.code and ativo)<>1 then raise exception 'Regra Halloween inválida';end if;
 if (x->>'quantidade')::numeric<=0 then raise exception 'Quantidade inválida';end if;
 base:=product.preco;
 if nullif(p_tabela_id,'')is not null then
 if not exists(select 1 from public.tabelas_preco where id::text=p_tabela_id and ativa and not usa_preco_custo)then raise exception 'Tabela inválida';end if;
 select coalesce((select t.preco from public.itens_tabela_preco t where t.tabela_id::text=p_tabela_id and t.produto_id=product.id and coalesce(t.quantidade_minima,1)<=(x->>'quantidade')::numeric order by coalesce(t.quantidade_minima,1) desc limit 1),product.preco)into base;
 end if;
 if base is null or base<=0 or (x->>'preco_unitario')::numeric is distinct from base or (x->>'desconto_item')::numeric is distinct from round(base*rule.percent/100,2)then raise exception 'Preço/desconto Halloween divergente';end if;
 end if;end loop;
 if selected=0 then raise exception 'Selecione ao menos um item Halloween';end if;
 if exists(select 1 from jsonb_array_elements(p_itens)x where coalesce((x->>'promotion_discount_total')::numeric,0)<0 or coalesce((x->>'promotion_discount_total')::numeric,0)>(x->>'quantidade')::numeric*((x->>'preco_unitario')::numeric-coalesce((x->>'desconto_item')::numeric,0)) or (nullif(x->>'halloween_rule_id','')is not null and coalesce((x->>'promotion_discount_total')::numeric,0)<>0)) or coalesce(p_desconto,0) is distinct from (select coalesce(sum(coalesce((x->>'promotion_discount_total')::numeric,0)),0)from jsonb_array_elements(p_itens)x where nullif(x->>'halloween_rule_id','')is null)then raise exception 'Halloween não acumula desconto geral';end if;
 v_result:=public.finalizar_venda_com_desconto_item(p_itens,p_pagamentos,p_pessoa_id,p_desconto,p_observacoes,p_deposito_id,p_series,p_vendedor_id,p_vendedor_nome,p_credito_valor,p_tipo_entrega,p_endereco_entrega);
 sid:=(v_result->>'venda_id')::uuid;
 if sid is null or not exists(select 1 from public.vendas where id=sid and status='concluida'and deposito_id=p_deposito_id)then raise exception 'Venda não concluída';end if;
 -- Normalize existing other-product promotions into their original lines. The ERP
 -- return RPC prorates header desconto; leaving it here would discount Halloween twice.
 update public.itens_venda i set desconto_item=coalesce(i.desconto_item,0)+round(coalesce((x->>'promotion_discount_total')::numeric,0)/nullif(i.quantidade,0),2),total_item=i.total_item-coalesce((x->>'promotion_discount_total')::numeric,0)
 from jsonb_array_elements(p_itens)x where i.venda_id=sid and i.produto_id=x->>'produto_id'and nullif(x->>'halloween_rule_id','')is null;
 update public.vendas set desconto=0 where id=sid;
 if (select round(sum(total_item),2)from public.itens_venda where venda_id=sid)is distinct from(select total-coalesce((select sum(coalesce((p->>'taxa')::numeric,0))from jsonb_array_elements(p_pagamentos)p),0)from public.vendas where id=sid)then raise exception 'Normalização de desconto divergente';end if;
 insert into halloween_private.margin_items(campaign_id,sale_id,item_id,store_id,product_id,rule_id,version,quantity,revenue,unit_cost)
 select 'halloween-2026',sid,i.id,store,i.produto_id,x->>'halloween_rule_id',(x->>'halloween_version')::integer,i.quantidade,i.total_item,case when p.preco_custo>0 then p.preco_custo end from jsonb_array_elements(p_itens)x join public.itens_venda i on i.venda_id=sid and i.produto_id=x->>'produto_id'join public.produtos p on p.id=i.produto_id where nullif(x->>'halloween_rule_id','')is not null;
 if (select count(*)from halloween_private.margin_items where sale_id=sid)<>selected then raise exception 'Falha ao vincular itens Halloween';end if;
 update halloween_private.margin_operations set result=v_result where operation_id=p_operation;
 -- Checkout persists attribution only; cron/staff state performs campaign aggregation.
 return v_result;
end $$;
create function public.halloween_margin_replay(p_operation uuid,p_actor uuid,p_request jsonb)returns jsonb language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
declare op halloween_private.margin_operations;
begin
 if p_operation is null or p_actor is null or jsonb_typeof(p_request)is distinct from 'array'or jsonb_array_length(p_request)<>13 or (p_request->>7)::uuid is distinct from p_actor then raise exception 'Operação/operador inválido';end if;
 select * into op from halloween_private.margin_operations where operation_id=p_operation;
 if not found then return null;end if;
 if op.payload<>p_request or (op.payload->>7)::uuid is distinct from p_actor then raise exception 'Operação reutilizada com dados diferentes';end if;
 return case when op.result is null then null else op.result||jsonb_build_object('jaExistia',true,'vendedor_nome',op.payload->8)end;
end $$;
revoke all on function public.halloween_margin_replay(uuid,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.halloween_margin_replay(uuid,uuid,jsonb)to service_role;
create function public.halloween_margin_state(p_campaign text,p_store uuid default null,p_from date default null,p_to date default null,p_product text default null)returns jsonb language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
declare output jsonb;
begin
 perform halloween_private.require_staff();perform halloween_private.margin_reconcile(p_campaign);
 with e as(select e.*,v.numero,v.status,v.created_at,l.nome store_name,p.nome name from halloween_private.margin_effective(p_campaign)e join public.vendas v on v.id=e.sale_id join public.lojas l on l.id=e.store_id join public.produtos p on p.id=e.product_id where(p_store is null or e.store_id=p_store)and(p_product is null or e.product_id=p_product)and(p_from is null or (v.created_at at time zone 'America/Sao_Paulo')::date>=p_from)and(p_to is null or (v.created_at at time zone 'America/Sao_Paulo')::date<=p_to)),products as(select product_id,max(name)name,store_id,sum(quantity)quantity,sum(revenue)revenue,case when bool_or(pending or cost is null)then null else sum(cost)end cost,case when bool_or(pending or cost is null)then null else sum(margin)end margin from e group by product_id,store_id),sales as(select sale_id,max(numero)number,store_id,max(store_name)store_name,max(created_at)created_at,max(status)status,sum(quantity)quantity,sum(revenue)revenue,case when bool_or(pending or cost is null)then null else sum(cost)end cost,case when bool_or(pending or cost is null)then null else sum(margin)end margin,bool_or(pending)pending from e group by sale_id,store_id)
 select jsonb_build_object('stores',(select coalesce(jsonb_agg(jsonb_build_object('id',s.store_id,'name',l.nome,'total',s.total,'pending',s.pending,'unlocked_at',s.unlocked_at,'unlocked_margin',s.unlocked_margin)),'[]')from halloween_private.margin_stores s join public.lojas l on l.id=s.store_id where s.campaign_id=p_campaign and(p_store is null or s.store_id=p_store)),'products',(select coalesce(jsonb_agg(to_jsonb(p)),'[]')from products p),'sales',(select coalesce(jsonb_agg(to_jsonb(s)),'[]')from sales s),'last_sync_at',(select max(last_sync_at)from halloween_private.margin_stores where campaign_id=p_campaign),'sync_error',case when exists(select 1 from pg_extension where extname='pg_cron')then null else 'pg_cron ausente: reconciliação automática indisponível'end)into output;
 return output;
end $$;
create function public.halloween_margin_correct_cost(p_campaign text,p_item uuid,p_cost numeric,p_reason text)returns void language plpgsql security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
declare actor uuid; old numeric;
begin actor:=halloween_private.require_staff();if p_cost is null or p_cost<=0 or p_cost<>round(p_cost,2)or length(btrim(coalesce(p_reason,'')))not between 10 and 500 then raise exception 'Custo e justificativa obrigatórios';end if;select unit_cost into strict old from halloween_private.margin_items where campaign_id=p_campaign and item_id=p_item for update;insert into halloween_private.margin_cost_audit(campaign_id,item_id,actor,old_cost,new_cost,reason)values(p_campaign,p_item,actor,old,p_cost,p_reason);update halloween_private.margin_items set unit_cost=p_cost where campaign_id=p_campaign and item_id=p_item;perform halloween_private.margin_reconcile(p_campaign);end $$;
create function halloween_private.draw_pool_for(p_campaign text,p_excluded integer[],p_store uuid)returns table(product_id integer,chance_bps numeric)language sql stable security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$
with available as(select p.id,p.weight from halloween_private.products p where p.campaign_id=p_campaign and p.enabled and(p.unlimited or p.remaining>0)and p.weight>0 and not(p.id=any(coalesce(p_excluded,'{}')))and(p.id not in(12,13)or exists(select 1 from halloween_private.margin_stores s where s.campaign_id=p_campaign and s.store_id=p_store and s.unlocked_at is not null))),totals as(select coalesce(sum(weight)filter(where id not in(12,13)),0)::numeric common,count(*)filter(where id in(12,13))*50 rare from available)
select a.id,case when a.id in(12,13)then 50::numeric else a.weight*(10000-t.rare)/nullif(t.common,0)end from available a cross join totals t where t.common>0
$$;
create or replace function halloween_private.draw_pool_for(p_campaign text,p_excluded integer[])returns table(product_id integer,chance_bps numeric)language sql stable security definer set search_path=''set lock_timeout='3s'set statement_timeout='10s'as $$select * from halloween_private.draw_pool_for(p_campaign,p_excluded,null)$$;
-- Ticket catalog uses the same store-scoped probabilities as its eventual draw.
do $$declare body text;begin
 body:=pg_get_functiondef('halloween_private.catalog_for(text,integer[])'::regprocedure);
 body:=replace(body,'p_excluded integer[])','p_excluded integer[], p_store uuid)');
 body:=replace(body,'draw_pool_for(c.id,p_excluded)','draw_pool_for(c.id,p_excluded,p_store)');
 -- pg_get_functiondef formats SQL parameter spacing, so normalize the header explicitly.
 body:=regexp_replace(body,'catalog_for\(p_campaign text, p_excluded integer\[\]\)','catalog_for(p_campaign text, p_excluded integer[], p_store uuid)');
 execute body;
 body:=pg_get_functiondef('halloween_private.ticket(text)'::regprocedure);
 if position('catalog_for(c.id,t.excluded_products)'in body)=0 then raise exception 'Ticket incompatível';end if;
 execute replace(body,'catalog_for(c.id,t.excluded_products)','catalog_for(c.id,t.excluded_products,t.loja_id)');
end $$;
revoke all on function halloween_private.catalog_for(text,integer[],uuid)from public,anon,authenticated;
-- Preserve the existing hardened spin body, adding only canonical ticket store context.
do $$declare body text;begin body:=pg_get_functiondef('halloween_private.spin(text)'::regprocedure);if position('draw_pool_for(c.id,t.excluded_products)'in body)=0 then raise exception 'Spin incompatível: revisar manualmente';end if;body:=replace(body,'draw_pool_for(c.id,t.excluded_products)','draw_pool_for(c.id,t.excluded_products,t.loja_id)');execute body;end $$;
do $$declare r record;begin for r in select tablename from pg_tables where schemaname='halloween_private'and tablename like 'margin_%'loop execute format('alter table halloween_private.%I enable row level security',r.tablename);execute format('revoke all on halloween_private.%I from public,anon,authenticated',r.tablename);end loop;end $$;
revoke all on function halloween_private.margin_window(text),halloween_private.margin_effective(text),halloween_private.margin_reconcile(text),halloween_private.draw_pool_for(text,integer[],uuid)from public,anon,authenticated;
revoke all on function public.halloween_pdv_rules(text),public.halloween_margin_reconcile(text),public.finalizar_venda_halloween(jsonb,jsonb,text,numeric,text,text,jsonb,uuid,text,numeric,text,text,uuid,text)from public,anon,authenticated;
grant execute on function public.halloween_pdv_rules(text),public.halloween_margin_reconcile(text),public.finalizar_venda_halloween(jsonb,jsonb,text,numeric,text,text,jsonb,uuid,text,numeric,text,text,uuid,text)to service_role;
revoke all on function public.halloween_margin_state(text,uuid,date,date,text),public.halloween_margin_correct_cost(text,uuid,numeric,text)from public,anon;
grant execute on function public.halloween_margin_state(text,uuid,date,date,text),public.halloween_margin_correct_cost(text,uuid,numeric,text)to authenticated;
-- Cron opens its own connection: set its deadline before starting reconciliation.
do $$begin if exists(select 1 from pg_extension where extname='pg_cron')then execute $job$select cron.schedule('halloween-auto-margin','* * * * *',$cron$set statement_timeout='10s';set lock_timeout='3s';select halloween_private.margin_reconcile('halloween-2026')$cron$)$job$;end if;end $$;
commit;
