-- Incremental promotion-only migration. No ERP DML, triggers, roles or global settings.
begin;
set local lock_timeout='3s';
do $$begin if exists(select 1 from halloween_private.campaigns where id='halloween-2026'and active)then raise exception 'Pause a campanha antes da atualização';end if;end $$;
create table halloween_private.payment_proofs(
 id uuid primary key default gen_random_uuid(),campaign_id text not null references halloween_private.campaigns(id),
 kind text not null check(kind in('sale','os')),source_id uuid not null,source_created_at timestamptz not null,
 paid_at timestamptz not null,origin text not null check(origin in('auto','manual_time','manual_os')),
 loja_id uuid not null,customer_id text not null,amount numeric not null check(amount>=200),
 receipt_ids text[] not null default '{}',evidence jsonb not null default '{}',actor uuid,reason text,created_at timestamptz not null default clock_timestamp(),
 unique(campaign_id,kind,source_id),check(paid_at>=source_created_at),check(origin='auto'or(actor is not null and length(btrim(reason))between 5 and 300))
);
create table halloween_private.payment_claims(campaign_id text not null,receipt_id text not null,proof_id uuid not null references halloween_private.payment_proofs(id),primary key(campaign_id,receipt_id));
alter table halloween_private.payment_proofs enable row level security;
alter table halloween_private.payment_claims enable row level security;
revoke all on halloween_private.payment_proofs,halloween_private.payment_claims from public,anon,authenticated;
alter table halloween_private.tickets add column proof_id uuid references halloween_private.payment_proofs(id);

-- Offset-free legacy credit history is explicitly Sao Paulo, never server timezone.
create function halloween_private.payment_timestamp(p_value text)returns timestamptz language plpgsql stable set search_path='' as $$
begin
 if p_value is null or p_value!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'then return null;end if;
 if p_value~'(Z|[+-]\d{2}:?\d{2})$'then return p_value::timestamptz;end if;
 return p_value::timestamp at time zone 'America/Sao_Paulo';
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $$;
create function halloween_private.receipt_day(p_value timestamptz)returns date language sql stable set search_path='' as $$
 select case when(p_value at time zone 'UTC')::time='00:00:00'then(p_value at time zone 'UTC')::date else(p_value at time zone 'America/Sao_Paulo')::date end
$$;
create function halloween_private.source_data(p_kind text,p_id uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'kind','sale','created_at',s.created_at,'customer_id',s.pessoa_id,'customer',p.nome,'amount',s.total,'loja_id',l.id,'loja',l.nome,'status',s.status)
 from public.vendas s join public.pessoas p on p.id=s.pessoa_id join public.depositos d on d.id=s.deposito_id join public.lojas l on l.id=d.loja_id and l.ativa
 where p_kind='sale'and s.id=p_id and s.status='concluida'and s.total>=200 and not coalesce(s.uso_interno,false)and s.ml_order_id is null and nullif(btrim(p.nome),'')is not null
 union all
 select jsonb_build_object('id',o.id,'kind','os','created_at',o.created_at,'customer_id',o.pessoa_id,'customer',p.nome,'amount',o.total,'loja_id',l.id,'loja',l.nome,'status',o.status)
 from public.ordens_servico o join public.pessoas p on p.id=o.pessoa_id join public.depositos d on d.id=o.deposito_id join public.lojas l on l.id=d.loja_id and l.ativa
 where p_kind='os'and o.id=p_id and o.status='entregue'and o.total>=200 and nullif(btrim(p.nome),'')is not null
$$;
create function halloween_private.sale_payment_proof(p_id uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.vendas; l record; e record; money numeric; credit numeric; covered numeric; accum numeric; at_time timestamptz; event_at timestamptz; paid timestamptz; refs text[]; day date; ambiguous boolean:=false;
begin
 select * into v from public.vendas where id=p_id;
 if not found or not halloween_private.sale_paid(p_id)then return jsonb_build_object('status','unpaid');end if;
 select coalesce(sum(valor)filter(where status='vale'),0),coalesce(sum(valor+coalesce(taxa,0))filter(where status='pago'),0),max(created_at)filter(where status in('vale','pago'))into credit,money,paid from public.pagamentos_venda where venda_id=p_id;
 select coalesce(array_agg(id order by id),'{}'),max(halloween_private.receipt_day(data_pagamento))into refs,day from public.lancamentos where venda_id=p_id and tipo='receber'and status='pago'and valor>0;
 if exists(select 1 from public.pagamentos_venda where venda_id=p_id and status in('vale','pago')and created_at is null)then ambiguous:=true;end if;
 if money+credit<v.total then
  covered:=credit;
  for l in select * from public.lancamentos where venda_id=p_id and tipo='receber'and status='pago'and valor>0 order by created_at,id loop
   accum:=0;at_time:=null;
   for e in select (x->>'valor')::numeric amount,halloween_private.payment_timestamp(x->>'data')ts from jsonb_array_elements(case when jsonb_typeof(l.historico_pagamentos)='array'then l.historico_pagamentos else '[]'::jsonb end)x where coalesce(x->>'valor','')~'^\d+(\.\d+)?$'order by halloween_private.payment_timestamp(x->>'data')nulls last loop
    if accum>=l.valor then exit;end if;
    if e.amount>0 then accum:=accum+e.amount;if e.ts is null then ambiguous:=true;else at_time:=greatest(at_time,e.ts);end if;end if;
   end loop;
   if accum<l.valor then
    -- An initial receipt may be duplicated in the checkout payment rows.
    if accum=0 and coalesce(l.valor_pago,0)=0 and money>=l.valor and l.created_at between v.created_at and v.created_at+interval '10 minutes'then
     money:=money-l.valor;at_time:=paid;
    else ambiguous:=true;end if;
   end if;
   covered:=covered+l.valor;paid:=greatest(paid,at_time);
  end loop;
  if covered<v.total then return jsonb_build_object('status','unpaid');end if;
 end if;
 if paid is null or paid<v.created_at or paid>clock_timestamp()then ambiguous:=true;end if;
 return jsonb_build_object('status',case when ambiguous then 'needs_time'else 'ready'end,'paid_at',case when not ambiguous then paid end,'receipt_ids',refs,'payment_day',day);
end $$;
create function halloween_private.proof_window(p_campaign text,p_created timestamptz,p_paid timestamptz,p_now timestamptz default clock_timestamp())returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(c.active and c.stock_confirmed and p_paid>=p_created and p_paid<=p_now and p_paid+interval '48 hours'>p_now
 and(c.starts_at is null or(p_created>=c.starts_at and p_paid>=c.starts_at))and(c.ends_at is null or(p_created<c.ends_at and p_paid<c.ends_at))
 and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and p_created>=w.started_at and(w.ended_at is null or p_created<w.ended_at)),false)
 from halloween_private.campaigns c where c.id=p_campaign
$$;
create function halloween_private.proof_evidence(p_kind text,p_source uuid,p_refs text[])returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('receipts',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'amount',l.valor,'payment_date_epoch',extract(epoch from l.data_pagamento),'history',l.historico_pagamentos)order by l.id),'[]')from public.lancamentos l where l.id=any(p_refs)),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(pv)->>'id','amount',pv.valor,'fee',pv.taxa,'status',pv.status,'created_at_epoch',extract(epoch from pv.created_at))order by pv.created_at,pv.valor,pv.status,to_jsonb(pv)->>'id'),'[]')from public.pagamentos_venda pv where p_kind='sale'and pv.venda_id=p_source),
 'source_received_epoch',(select extract(epoch from o.recebido_em) from public.ordens_servico o where p_kind='os'and o.id=p_source))
$$;
revoke all on function halloween_private.proof_evidence(text,uuid,text[])from public,anon,authenticated;
create function halloween_private.proof_valid(p_id uuid)returns boolean language plpgsql stable security definer set search_path='' as $$
declare p halloween_private.payment_proofs; d jsonb; receipts_ok boolean;
begin
 select * into p from halloween_private.payment_proofs where id=p_id;if not found then return false;end if;
 d:=halloween_private.source_data(p.kind,p.source_id);
 if d is null or d->>'customer_id'<>p.customer_id or(d->>'amount')::numeric<>p.amount or(d->>'loja_id')::uuid<>p.loja_id or(d->>'created_at')::timestamptz is distinct from p.source_created_at then return false;end if;
 if halloween_private.proof_evidence(p.kind,p.source_id,p.receipt_ids)is distinct from p.evidence then return false;end if;
 select count(*)=cardinality(p.receipt_ids)into receipts_ok from public.lancamentos l where l.id=any(p.receipt_ids)and l.tipo='receber'and l.status='pago'and l.valor>0
 and(case when p.kind='sale'then l.venda_id=p.source_id else l.venda_id is null and l.loja_id=p.loja_id end);
 if not receipts_ok then return false;end if;
 if p.kind='sale'then return halloween_private.sale_paid(p.source_id);end if;
 return cardinality(p.receipt_ids)>0 and(select coalesce(sum(valor),0)>=p.amount from public.lancamentos where id=any(p.receipt_ids));
end $$;
-- All emission paths share the campaign mutex and canonical source uniqueness.
-- Call only after the campaign mutex: source, checkout payments, receipts by id.
-- Financial triggers may acquire their own locks; 3s timeout and deadlock retry
-- bound contention. No claim that shared ERP transactions cannot deadlock.
create function halloween_private.lock_financial(p_kind text,p_source uuid,p_refs text[])returns void language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
begin
 if p_kind='sale'then
  perform 1 from public.vendas where id=p_source for share;
  perform 1 from public.pagamentos_venda pv where venda_id=p_source order by created_at,valor,status,to_jsonb(pv)->>'id'for share;
 else
  perform 1 from public.ordens_servico where id=p_source for share;
 end if;
 perform 1 from public.lancamentos l where case when p_refs is not null then l.id=any(p_refs)
 when p_kind='sale'then l.venda_id=p_source else exists(select 1 from public.ordens_servico o where o.id=p_source and l.venda_id is null and l.descricao='Recebimento OS #'||o.numero::text)end order by l.id for share;
end $$;
revoke all on function halloween_private.lock_financial(text,uuid,text[])from public,anon,authenticated;
create function halloween_private.receipt_claimed(p_campaign text,p_receipt text)returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from halloween_private.payment_claims where campaign_id=p_campaign and receipt_id=p_receipt)
 or exists(select 1 from halloween_private.tickets t join public.ordens_servico o on o.id=t.os_id join public.lancamentos l on l.id=p_receipt
 where t.campaign_id=p_campaign and t.proof_id is null and t.replaces_coupon_id is null and l.venda_id is null
 and l.descricao='Recebimento OS #'||o.numero::text and l.pessoa_nome is not distinct from o.pessoa_nome
 and l.loja_id=t.loja_id and l.valor>=o.total and l.created_at between o.recebido_em-interval '1 minute'and o.recebido_em+interval '10 minutes')
$$;
revoke all on function halloween_private.receipt_claimed(text,text)from public,anon,authenticated;
create function halloween_private.issue_proof(p_campaign text,p_kind text,p_id uuid,p_paid timestamptz,p_receipts text[],p_origin text,p_actor uuid default null,p_reason text default null)returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare c halloween_private.campaigns; d jsonb; p uuid; t uuid; token text; refs text[]; row_count integer; total numeric; day date;
begin
 select * into c from halloween_private.campaigns where id=p_campaign for update;if not found then raise exception 'Campanha não encontrada';end if;
 select id into t from halloween_private.tickets where campaign_id=c.id and replaces_coupon_id is null and(case when p_kind='sale'then sale_id=p_id else os_id=p_id end);if found then return t;end if;
 d:=halloween_private.source_data(p_kind,p_id);if d is null then raise exception 'Compra/OS sem cliente, loja ou estado elegível';end if;
 if halloween_private.proof_window(c.id,(d->>'created_at')::timestamptz,p_paid)is distinct from true then raise exception 'Compra e quitação precisam estar no período; as48h desde a quitação não podem ter terminado';end if;
 if p_origin<>'auto'and(p_actor is null or p_reason is null or length(btrim(p_reason))not between 5 and 300)then raise exception 'Informe motivo e operador';end if;
 select coalesce(array_agg(distinct x order by x),'{}')into refs from unnest(coalesce(p_receipts,'{}'))x;
 if cardinality(refs)<>coalesce(cardinality(p_receipts),0)or cardinality(refs)>20 then raise exception 'Recebimentos duplicados ou acima do limite20';end if;
 perform halloween_private.lock_financial(p_kind,p_id,refs);
 if halloween_private.source_data(p_kind,p_id)is distinct from d then raise exception 'Compra/OS alterada durante a conferência. Consulte novamente';end if;
 -- Locks prevent the selected receipts changing during issuance. Never write ERP.
 perform 1 from public.lancamentos where id=any(refs)order by id for share;
 if p_kind='sale'then
  if not halloween_private.sale_paid(p_id)then raise exception 'Compra ainda não quitada';end if;
  select count(*),max(halloween_private.receipt_day(data_pagamento))into row_count,day from public.lancamentos where id=any(refs)and venda_id=p_id and tipo='receber'and status='pago'and valor>0;
 else
  select count(*),sum(valor),max(halloween_private.receipt_day(data_pagamento))into row_count,total,day from public.lancamentos where id=any(refs)and venda_id is null and loja_id=(d->>'loja_id')::uuid and tipo='receber'and status='pago'and valor>0;
  if cardinality(refs)=0 or coalesce(total,0)<(d->>'amount')::numeric then raise exception 'Selecione recebimentos pagos suficientes da loja da OS';end if;
 end if;
 if row_count<>cardinality(refs)then raise exception 'Recebimento inexistente, cancelado ou incompatível';end if;
 if exists(select 1 from unnest(refs)r where halloween_private.receipt_claimed(c.id,r))then raise exception 'Recebimento já vinculado a outra participação nesta campanha';end if;
 if p_origin<>'auto'and(day is null or(p_paid at time zone 'America/Sao_Paulo')::date<>day)then raise exception 'Horário precisa corresponder ao dia registrado da quitação';end if;
 insert into halloween_private.payment_proofs(campaign_id,kind,source_id,source_created_at,paid_at,origin,loja_id,customer_id,amount,receipt_ids,evidence,actor,reason)
 values(c.id,p_kind,p_id,(d->>'created_at')::timestamptz,p_paid,p_origin,(d->>'loja_id')::uuid,d->>'customer_id',(d->>'amount')::numeric,refs,
 halloween_private.proof_evidence(p_kind,p_id,refs),p_actor,p_reason)returning id into p;
 insert into halloween_private.payment_claims(campaign_id,receipt_id,proof_id)select c.id,x,p from unnest(refs)x;
 t:=gen_random_uuid();token:=encode(extensions.hmac(convert_to(t::text,'UTF8'),c.secret,'sha256'),'hex');
 insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,customer_id,sale_id,os_id,loja_id,amount_cents,token_hash,created_at,expires_at,created_by,proof_id)
 values(t,c.id,upper(p_kind)||replace(p_id::text,'-',''),left(d->>'customer',80),d->>'customer_id',case when p_kind='sale'then p_id end,case when p_kind='os'then p_id end,(d->>'loja_id')::uuid,least(round((d->>'amount')::numeric*100),2147483647)::integer,encode(extensions.digest(token,'sha256'),'hex'),clock_timestamp(),p_paid+interval '48 hours',p_actor,p);
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(c.id,p_origin||'_'||p_kind||'_issue',t::text,p_actor);return t;
end $$;

-- Preserve legacy tickets and snapshots; proofs apply only to newly issued origins.
alter function halloween_private.sale_valid(uuid)rename to sale_valid_legacy;
create function halloween_private.sale_valid(p_ticket uuid)returns boolean language sql stable security definer set search_path='' as $$
 select t.revoked_at is null and case when t.proof_id is null then halloween_private.sale_valid_legacy(t.id)else halloween_private.proof_valid(t.proof_id)end from halloween_private.tickets t where t.id=p_ticket
$$;
create or replace function halloween_private.capture_sale(p_campaign text,p_sale jsonb,p_customer text)returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare d jsonb; existing uuid;
begin
 select id into existing from halloween_private.tickets where campaign_id=p_campaign and sale_id=(p_sale->>'id')::uuid and replaces_coupon_id is null;if found then return existing;end if;
 d:=halloween_private.sale_payment_proof((p_sale->>'id')::uuid);
 if d->>'status'<>'ready'or halloween_private.source_data('sale',(p_sale->>'id')::uuid)is null then return null;end if;
 if halloween_private.proof_window(p_campaign,(p_sale->>'created_at')::timestamptz,(d->>'paid_at')::timestamptz)is distinct from true then return null;end if;
 return halloween_private.issue_proof(p_campaign,'sale',(p_sale->>'id')::uuid,(d->>'paid_at')::timestamptz,array(select jsonb_array_elements_text(d->'receipt_ids')),'auto');
end $$;
create or replace function halloween_private.capture_os(p_campaign text,p_os uuid)returns uuid language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare d jsonb; s jsonb; refs text[]; existing uuid;
begin
 select id into existing from halloween_private.tickets where campaign_id=p_campaign and os_id=p_os and replaces_coupon_id is null;if found then return existing;end if;
 d:=halloween_private.paid_os(p_os);s:=halloween_private.source_data('os',p_os);
 if d is null or s is null or halloween_private.proof_window(p_campaign,(s->>'created_at')::timestamptz,(d->>'received_at')::timestamptz)is distinct from true then return null;end if;
 select array_agg(l.id)into refs from public.lancamentos l join public.ordens_servico o on o.id=p_os where l.tipo='receber'and l.status='pago'and l.venda_id is null and l.valor>=o.total and l.descricao='Recebimento OS #'||o.numero::text and l.pessoa_nome is not distinct from o.pessoa_nome and l.loja_id=(s->>'loja_id')::uuid and l.created_at between o.recebido_em-interval '1 minute'and o.recebido_em+interval '10 minutes';
 if coalesce(cardinality(refs),0)<>1 or exists(select 1 from unnest(refs)r where halloween_private.receipt_claimed(p_campaign,r))then return null;end if;
 return halloween_private.issue_proof(p_campaign,'os',p_os,(d->>'received_at')::timestamptz,refs,'auto');
end $$;

create function halloween_private.issue_os_manual(p_campaign text,p_os uuid,p_receipts text[],p_paid_at timestamptz,p_reason text,p_confirm boolean)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid; t uuid; c halloween_private.campaigns;
begin
 u:=halloween_private.require_staff();if p_confirm is distinct from true then raise exception 'Confirme a conferência dos recebimentos';end if;
 t:=halloween_private.issue_proof(p_campaign,'os',p_os,p_paid_at,p_receipts,'manual_os',u,btrim(p_reason));select * into c from halloween_private.campaigns where id=p_campaign;
 return jsonb_build_object('id',t,'expires_at',(select expires_at from halloween_private.tickets where id=t),'token',encode(extensions.hmac(convert_to(t::text,'UTF8'),c.secret,'sha256'),'hex'),'test_mode',c.test_mode);
end $$;
create function halloween_private.confirm_sale_time(p_campaign text,p_sale uuid,p_paid_at timestamptz,p_reason text,p_confirm boolean)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid; d jsonb; t uuid; c halloween_private.campaigns;
begin
 u:=halloween_private.require_staff();if p_confirm is distinct from true then raise exception 'Confirme o horário do comprovante';end if;
 d:=halloween_private.sale_payment_proof(p_sale);if d->>'status'<>'needs_time'then raise exception 'Esta compra não precisa de conferência de horário ou não está quitada';end if;
 t:=halloween_private.issue_proof(p_campaign,'sale',p_sale,p_paid_at,array(select jsonb_array_elements_text(d->'receipt_ids')),'manual_time',u,btrim(p_reason));select * into c from halloween_private.campaigns where id=p_campaign;
 return jsonb_build_object('id',t,'expires_at',(select expires_at from halloween_private.tickets where id=t),'token',encode(extensions.hmac(convert_to(t::text,'UTF8'),c.secret,'sha256'),'hex'),'test_mode',c.test_mode);
end $$;

-- Bounded source window, never the old purchase-created-within48h predicate.
create or replace function halloween_private.sync_sales()returns integer language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare c halloween_private.campaigns; s record; n integer:=0;
begin
 for c in select * from halloween_private.campaigns where not test_mode for update skip locked loop
  begin
   update halloween_private.tickets t set revoked_at=clock_timestamp(),revoked_reason='Compra ou comprovação financeira inválida'where t.campaign_id=c.id and t.revoked_at is null and not halloween_private.sale_valid(t.id);
   with released as(update halloween_private.coupons r set released_at=clock_timestamp()from halloween_private.tickets t where r.ticket_id=t.id and t.campaign_id=c.id and t.revoked_at is not null and r.redeemed_at is null and r.released_at is null returning r.product_id),
   counts as(select product_id,count(*)::integer qty from released group by product_id)
   update halloween_private.products p set remaining=p.remaining+x.qty from counts x where p.campaign_id=c.id and p.id=x.product_id and not p.unlimited;
   perform halloween_private.release_expired(c.id);
   if c.active and c.stock_confirmed then
    for s in select to_jsonb(v)data,p.nome from public.vendas v join public.pessoas p on p.id=v.pessoa_id
    cross join lateral(select halloween_private.sale_payment_proof(v.id)proof)pr
    where v.status='concluida'and v.total>=200 and(c.starts_at is null or v.created_at>=c.starts_at)and(c.ends_at is null or v.created_at<c.ends_at)
    and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.sale_id=v.id and t.replaces_coupon_id is null)
    and pr.proof->>'status'='ready'and halloween_private.proof_window(c.id,v.created_at,(pr.proof->>'paid_at')::timestamptz)
    and halloween_private.source_data('sale',v.id)is not null order by v.created_at,v.id limit 200 loop
     if halloween_private.capture_sale(c.id,s.data,s.nome)is not null then n:=n+1;end if;
    end loop;
    for s in select o.id from public.ordens_servico o where o.status='entregue'and o.total>=200
    and(c.starts_at is null or o.created_at>=c.starts_at)and(c.ends_at is null or o.created_at<c.ends_at)
    and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.os_id=o.id and t.replaces_coupon_id is null)
    and halloween_private.source_data('os',o.id)is not null
    and exists(select 1 from public.lancamentos l where l.venda_id is null and l.tipo='receber'and l.status='pago'and l.descricao='Recebimento OS #'||o.numero::text and l.valor>=o.total and l.pessoa_nome is not distinct from o.pessoa_nome and l.loja_id=(halloween_private.source_data('os',o.id)->>'loja_id')::uuid and l.created_at between o.recebido_em-interval '1 minute'and o.recebido_em+interval '10 minutes'and not halloween_private.receipt_claimed(c.id,l.id))
    and halloween_private.proof_window(c.id,o.created_at,(halloween_private.paid_os(o.id)->>'received_at')::timestamptz)
    order by o.created_at,o.id limit 200 loop
     if halloween_private.capture_os(c.id,s.id)is not null then n:=n+1;end if;
    end loop;
   end if;
   update halloween_private.campaigns set last_sync_at=clock_timestamp(),sync_error=null where id=c.id;
  exception when others then update halloween_private.campaigns set sync_error='Falha na conferência. Tente novamente ou solicite revisão.'where id=c.id;end;
 end loop;return n;
end $$;

-- Recreate proven implementations with one additive field, preserving public signatures.
do $$declare body text;begin
 body:=pg_get_functiondef('halloween_private.reissue(text,text)'::regprocedure);
 if position('created_by,replaces_coupon_id,excluded_products)'in body)=0 then raise exception 'Reissue base incompatível';end if;
 body:=replace(body,'created_by,replaces_coupon_id,excluded_products)','created_by,replaces_coupon_id,excluded_products,proof_id)');
 body:=replace(body,'array(select distinct unnest(t.excluded_products||r.product_id)))returning','array(select distinct unnest(t.excluded_products||r.product_id)),t.proof_id)returning');execute body;
 -- Replace SQL-bound legacy references after renaming sale_valid.
 body:=pg_get_functiondef('halloween_private.coupon_json(uuid)'::regprocedure);body:=replace(body,'sale_valid_legacy','sale_valid');execute body;
end $$;
create function public.halloween_issue_os_manual(p_campaign text,p_os uuid,p_receipts text[],p_paid_at timestamptz,p_reason text,p_confirm boolean)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.issue_os_manual(p_campaign,p_os,p_receipts,p_paid_at,p_reason,p_confirm)$$;
create function public.halloween_confirm_sale_time(p_campaign text,p_sale uuid,p_paid_at timestamptz,p_reason text,p_confirm boolean)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.confirm_sale_time(p_campaign,p_sale,p_paid_at,p_reason,p_confirm)$$;
revoke all on function halloween_private.payment_timestamp(text),halloween_private.receipt_day(timestamptz),halloween_private.source_data(text,uuid),halloween_private.sale_payment_proof(uuid),halloween_private.proof_window(text,timestamptz,timestamptz,timestamptz),halloween_private.proof_valid(uuid),halloween_private.issue_proof(text,text,uuid,timestamptz,text[],text,uuid,text),halloween_private.issue_os_manual(text,uuid,text[],timestamptz,text,boolean),halloween_private.confirm_sale_time(text,uuid,timestamptz,text,boolean),public.halloween_issue_os_manual(text,uuid,text[],timestamptz,text,boolean),public.halloween_confirm_sale_time(text,uuid,timestamptz,text,boolean),halloween_private.sale_valid_legacy(uuid)from public,anon,authenticated;
grant execute on function halloween_private.issue_os_manual(text,uuid,text[],timestamptz,text,boolean),halloween_private.confirm_sale_time(text,uuid,timestamptz,text,boolean),public.halloween_issue_os_manual(text,uuid,text[],timestamptz,text,boolean),public.halloween_confirm_sale_time(text,uuid,timestamptz,text,boolean)to authenticated;
alter function halloween_private.spin(text)set lock_timeout='3s';
alter function halloween_private.reissue(text,text)set lock_timeout='3s';
alter function halloween_private.redeem_at(text,uuid)set lock_timeout='3s';

-- Exact source lookup; never exposes bank credentials or accepts a free-form customer.
create function halloween_private.payment_review(p_campaign text,p_kind text,p_number integer,p_offset integer default 0)returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare c halloween_private.campaigns; src uuid; d jsonb; receipts jsonb; proof jsonb;
begin
 perform halloween_private.require_staff();
 if p_kind not in('sale','os')or p_number is null or p_number<1 or p_offset<0 or p_offset>10000 then raise exception 'Informe tipo, número e página válidos';end if;
 select * into c from halloween_private.campaigns where id=p_campaign;if not found then raise exception 'Campanha não encontrada';end if;
 if p_kind='sale'then select id into src from public.vendas where numero=p_number;else select id into src from public.ordens_servico where numero=p_number;end if;
 d:=halloween_private.source_data(p_kind,src);if d is null then raise exception 'Compra/OS inexistente ou sem cliente, loja ou situação elegível';end if;
 if(c.starts_at is not null and(d->>'created_at')::timestamptz<c.starts_at)or(c.ends_at is not null and(d->>'created_at')::timestamptz>=c.ends_at)then raise exception 'A abertura/compra está fora do período da campanha';end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at,x.id),'[]')into receipts from(
 select l.id,l.valor,l.descricao,l.created_at,halloween_private.receipt_day(l.data_pagamento)payment_day,
 halloween_private.receipt_claimed(c.id,l.id)claimed
 from public.lancamentos l where l.tipo='receber'and l.status='pago'and l.valor>0
 and(case when p_kind='sale'then l.venda_id=src else l.venda_id is null and l.loja_id=(d->>'loja_id')::uuid end)
 and halloween_private.receipt_day(l.data_pagamento)>=((coalesce(c.starts_at,clock_timestamp()-interval '7 days'))at time zone 'America/Sao_Paulo')::date
 and halloween_private.receipt_day(l.data_pagamento)<=((coalesce(c.ends_at,clock_timestamp()+interval '1 day')-interval '1 microsecond')at time zone 'America/Sao_Paulo')::date
 order by l.created_at,l.id limit 51 offset p_offset)x;
 if p_kind='sale'then proof:=halloween_private.sale_payment_proof(src);end if;
 return jsonb_build_object('source',d,'payment',proof,'receipts',receipts,'offset',p_offset,'existing_ticket',(
 select t.id from halloween_private.tickets t where t.campaign_id=c.id and t.replaces_coupon_id is null and(case when p_kind='sale'then t.sale_id=src else t.os_id=src end)));
end $$;
create function halloween_private.payment_pending(p_campaign text,p_offset integer default 0)returns jsonb language plpgsql security definer set search_path='' as $$
declare c halloween_private.campaigns; rows jsonb;
begin
 perform halloween_private.require_staff();if p_offset<0 or p_offset>10000 then raise exception 'Página inválida';end if;
 select * into c from halloween_private.campaigns where id=p_campaign;if not found then raise exception 'Campanha não encontrada';end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at,x.id),'[]')into rows from(
 select v.id,v.numero,v.created_at,pr.data->>'payment_day'payment_day from public.vendas v
 cross join lateral(select halloween_private.sale_payment_proof(v.id)data)pr
 where v.created_at>=coalesce(c.starts_at,clock_timestamp()-interval '7 days')and v.created_at<coalesce(c.ends_at,clock_timestamp()+interval '1 second')
 and pr.data->>'status'='needs_time'and halloween_private.source_data('sale',v.id)is not null
 and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.sale_id=v.id and t.replaces_coupon_id is null)
 order by v.created_at,v.id limit 51 offset p_offset)x;
 return rows;
end $$;
create function public.halloween_payment_review(p_campaign text,p_kind text,p_number integer,p_offset integer default 0)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.payment_review(p_campaign,p_kind,p_number,p_offset)$$;
create function public.halloween_payment_pending(p_campaign text,p_offset integer default 0)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.payment_pending(p_campaign,p_offset)$$;
revoke all on function halloween_private.sale_valid(uuid),halloween_private.payment_review(text,text,integer,integer),halloween_private.payment_pending(text,integer),public.halloween_payment_review(text,text,integer,integer),public.halloween_payment_pending(text,integer)from public,anon,authenticated;
grant execute on function halloween_private.payment_review(text,text,integer,integer),halloween_private.payment_pending(text,integer),public.halloween_payment_review(text,text,integer,integer),public.halloween_payment_pending(text,integer)to authenticated;

-- Campaign mutex first, matching all other promotion transactions.
do $$declare body text; locks text; pivot text:='select * into c from halloween_private.campaigns where id=r.campaign_id for update;';begin
 body:=pg_get_functiondef('halloween_private.redeem_at(text,uuid)'::regprocedure);
 locks:=substring(body from 'perform 1 from public.vendas[^;]+;[[:space:]]*perform 1 from public.ordens_servico[^;]+;');
 if locks is null or position(pivot in body)=0 then raise exception 'Ordem de locks base incompatível';end if;
 body:=replace(body,locks,'');body:=replace(body,pivot,pivot||chr(10)||locks);execute body;
end $$;

-- Add proof metadata to staff history, leaving legacy fields and snapshots intact.
do $$declare name text; body text; pivot text:='if not halloween_private.sale_valid(t.id)then';begin
 foreach name in array array['halloween_private.spin(text)','halloween_private.reissue(text,text)','halloween_private.redeem_at(text,uuid)']loop
  body:=pg_get_functiondef(name::regprocedure);
  if position(pivot in body)=0 then raise exception 'Validação base incompatível: %',name;end if;
  body:=replace(body,pivot,'perform halloween_private.lock_financial(case when t.sale_id is not null then ''sale'' else ''os'' end,coalesce(t.sale_id,t.os_id),(select receipt_ids from halloween_private.payment_proofs where id=t.proof_id));'||chr(10)||pivot);
  body:=replace(body,'-- Campaign lock serializes spin/reissue/redemption; no ERP lock is acquired.','-- Campaign mutex precedes bounded shared locks on financial evidence.');
  execute body;
 end loop;
end $$;
do $$declare body text;begin
 body:=pg_get_functiondef('halloween_private.client_tickets(text,text,integer)'::regprocedure);
 if position('select t.id,t.customer'in body)=0 then raise exception 'Histórico base incompatível';end if;
 body:=replace(body,'select t.id,t.customer','select t.id,(select paid_at from halloween_private.payment_proofs where id=t.proof_id)paid_at,(select source_created_at from halloween_private.payment_proofs where id=t.proof_id)source_created_at,(select origin from halloween_private.payment_proofs where id=t.proof_id)emission_origin,t.customer');execute body;
end $$;

-- PostgREST hoists statement_timeout from the called RPC before its query starts.
-- Direct SQL callers must SET LOCAL statement_timeout before invoking the function.
-- Confirm hoisting in the company's real PostgREST before production approval.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'and left(p.proname,10)='halloween_'loop
  execute format('alter function %s set statement_timeout=%L',f.signature,'10s');
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
