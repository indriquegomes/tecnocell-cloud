begin;
do $$
declare c text:='__QA__receipt'; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); t jsonb; r jsonb; tok text; result_id uuid;
begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 insert into public.lojas(id,nome,ativa,whatsapp)values(a,'Petrópolis',true,'(21) 99999-0001'),(b,'Teresópolis',true,'+55 (21) 98888-0002');
 insert into halloween_private.campaigns(id,title,active,stock_confirmed,test_mode)values(c,'__QA__ Comprovantes',true,true,true);
 insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,quantity,remaining,unlimited,enabled)values(c,9,'Carregador MD-CAR271A','percent',18,10000,0,0,true,true);
 for t in select public.halloween_issue(c,'__QA__'||n,'__QA__ Cliente',20000) from generate_series(1,2)n loop
  update halloween_private.tickets set loja_id=a where id=(t->>'id')::uuid;
  tok:=t->>'token';r:=public.halloween_spin(tok);result_id:=(r->>'id')::uuid;
  if r->'pickup_store' is distinct from jsonb_build_object('name','Petrópolis','whatsapp','(21) 99999-0001')then raise exception 'FAIL contato não veio da loja do ticket: %',r->'pickup_store';end if;
  -- Snapshot não pode sobrepor o vínculo canônico com a compra.
  update halloween_private.coupons set offer=offer||jsonb_build_object('loja','Outra loja','loja_id',b)where id=result_id;
  if public.halloween_ticket(tok)->'result'->'pickup_store'->>'name'<>'Petrópolis'then raise exception 'FAIL snapshot redirecionou contato';end if;
  update halloween_private.tickets set loja_id=b where id=(t->>'id')::uuid;
  r:=public.halloween_ticket(tok)->'result';
  if r->'pickup_store'->>'name'<>'Teresópolis'or r->'pickup_store'->>'whatsapp'<>'+55 (21) 98888-0002'then raise exception 'FAIL segunda loja';end if;
  if (select count(*)from jsonb_object_keys(r->'pickup_store'))<>2 then raise exception 'FAIL campos desnecessários no contato';end if;
  update public.lojas set whatsapp=null where id=b;
  if public.halloween_ticket(tok)->'result'->'pickup_store'->'whatsapp'<>'null'::jsonb then raise exception 'FAIL número ausente ganhou fallback';end if;
  update halloween_private.tickets set loja_id=null where id=(t->>'id')::uuid;
  if public.halloween_ticket(tok)->'result'->'pickup_store'<>'null'::jsonb then raise exception 'FAIL loja ausente ganhou fallback';end if;
  update public.lojas set whatsapp='+55 (21) 98888-0002' where id=b;
 end loop;
 if has_function_privilege('anon','public.halloween_lookup(text)','execute')then raise exception 'FAIL lookup ficou público';end if;
 if has_table_privilege('anon','halloween_private.tickets','select')or has_table_privilege('anon','public.lojas','select')then raise exception 'FAIL leitura de tabelas exposta';end if;
end $$;
select 'PASS contato: nome/WhatsApp vêm do ticket; snapshot não troca loja; ausência sem fallback; somente dois campos; grants preservados' result;
rollback;
