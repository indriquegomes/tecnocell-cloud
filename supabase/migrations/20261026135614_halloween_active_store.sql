-- Additive staff reads scoped to the active Cloud store. No ERP DML or campaign changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
create or replace function halloween_private.require_store(p_store uuid)returns void language plpgsql security definer set search_path='' as $$
declare actor uuid; profile jsonb; allowed jsonb;
begin
 actor:=halloween_private.require_staff();
 if p_store is null or not exists(select 1 from public.lojas where id=p_store and ativa)then raise exception 'Selecione uma loja ativa.' using errcode='42501';end if;
 select to_jsonb(p)into profile from public.perfis p where id=actor;allowed:=coalesce(nullif(profile->'lojas_permitidas','null'::jsonb),'[]'::jsonb);
 if not coalesce((profile->>'is_master')::boolean,false)and coalesce(jsonb_array_length(allowed),0)>0 and not(allowed ? p_store::text)then raise exception 'Sem acesso a esta loja.' using errcode='42501';end if;
end $$;
-- Clone installed functions to retain proof metadata, snapshots, expiry and token derivation.
do $$declare body text;begin
 body:=pg_get_functiondef('halloween_private.admin_state_v2(text,text,integer)'::regprocedure);
 if position('where t.campaign_id=c.id and position'in body)=0 or position('select s.numero from public.vendas s where'in body)=0 then raise exception 'Consulta de clientes incompatível; revisar sem aplicar';end if;
 body:=replace(body,'FUNCTION halloween_private.admin_state_v2(p_campaign text, p_search text, p_offset integer)','FUNCTION halloween_private.admin_state_for_store(p_campaign text, p_store uuid, p_search text, p_offset integer)');
 if position('FUNCTION halloween_private.admin_state_for_store('in body)=0 then raise exception 'Assinatura de clientes incompatível';end if;
 body:=replace(body,'perform halloween_private.require_staff();','perform halloween_private.require_staff();perform halloween_private.require_store(p_store);');
 body:=replace(body,'where t.campaign_id=c.id and position','where t.campaign_id=c.id and (t.loja_id=p_store or c.test_mode) and position');
 body:=replace(body,'select s.numero from public.vendas s where','select s.numero from public.vendas s where exists(select 1 from public.depositos d where d.id=s.deposito_id and d.loja_id=p_store) and');
 body:=replace(body,'from public.lojas where ativa','from public.lojas where ativa and id=p_store');
 body:=replace(body,'(select count(*)from halloween_private.tickets where campaign_id=c.id)','(select count(*)from halloween_private.tickets where campaign_id=c.id and (loja_id=p_store or c.test_mode))');
 body:=replace(body,'from halloween_private.coupons where campaign_id=c.id and','from halloween_private.coupons where campaign_id=c.id and (c.test_mode or ticket_id in(select id from halloween_private.tickets where campaign_id=c.id and loja_id=p_store)) and');
 body:=replace(body,'where campaign_id=c.id and loja_id=p_store','where campaign_id=c.id and loja_id=p_store');
 execute body;
 body:=pg_get_functiondef('halloween_private.client_tickets(text,text,integer)'::regprocedure);
 if position('where t.campaign_id=p_campaign and coalesce'in body)=0 then raise exception 'Histórico incompatível';end if;
 body:=regexp_replace(body,'FUNCTION halloween_private.client_tickets\(p_campaign text, p_customer text, p_offset integer[^)]*\)','FUNCTION halloween_private.client_tickets_for_store(p_campaign text, p_store uuid, p_customer text, p_offset integer DEFAULT 0)');
 if position('FUNCTION halloween_private.client_tickets_for_store('in body)=0 then raise exception 'Assinatura do histórico incompatível';end if;
 body:=replace(body,'v_user:=halloween_private.require_staff();','v_user:=halloween_private.require_staff();perform halloween_private.require_store(p_store);');
 body:=replace(body,'where t.campaign_id=p_campaign and coalesce','where t.campaign_id=p_campaign and (t.loja_id=p_store or c.test_mode) and coalesce');
 execute body;
end $$;
create or replace function public.halloween_admin_state_for_store(p_campaign text,p_store uuid,p_search text default '',p_offset integer default 0)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.admin_state_for_store(p_campaign,p_store,p_search,p_offset)$$;
create or replace function public.halloween_client_tickets_for_store(p_campaign text,p_store uuid,p_customer text,p_offset integer default 0)returns jsonb language sql security invoker set search_path='' as $$select halloween_private.client_tickets_for_store(p_campaign,p_store,p_customer,p_offset)$$;
revoke all on function halloween_private.require_store(uuid),halloween_private.admin_state_for_store(text,uuid,text,integer),halloween_private.client_tickets_for_store(text,uuid,text,integer),public.halloween_admin_state_for_store(text,uuid,text,integer),public.halloween_client_tickets_for_store(text,uuid,text,integer)from public,anon,authenticated;
grant execute on function halloween_private.admin_state_for_store(text,uuid,text,integer),halloween_private.client_tickets_for_store(text,uuid,text,integer),public.halloween_admin_state_for_store(text,uuid,text,integer),public.halloween_client_tickets_for_store(text,uuid,text,integer)to authenticated;
create index if not exists halloween_tickets_store on halloween_private.tickets(campaign_id,loja_id,created_at desc);
commit;
