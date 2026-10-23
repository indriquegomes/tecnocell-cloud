begin;
do $$
declare c text:='halloween-coupons-qa'; uid uuid:='00000000-0000-4000-8000-000000000001'; sid uuid:='00000000-0000-4000-8000-000000000002';
 t jsonb; r jsonb; replacement jsonb; replay jsonb; old_code text; first_stock integer;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'session_id',sid,'role','authenticated')::text,true);
 if (select count(*) from halloween_private.products where campaign_id='halloween-2026' and id<=11 and benefit_type='percent' and benefit_value between 10 and 20)<>11 then raise exception 'FAIL descontos originais: os comuns ainda estão grátis';end if;
 if (select count(*) from halloween_private.products where campaign_id='halloween-2026' and id in(12,13) and benefit_type='percent' and benefit_value=100)<>2 then raise exception 'FAIL dois prêmios gratuitos';end if;
 insert into halloween_private.campaigns(id,title,test_mode,active,stock_confirmed)values(c,'QA cupons',true,true,true);
 insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,quantity,remaining,unlimited,enabled)
 select c,id,name,benefit_type,benefit_value,weight,case when id<=11 then 0 else 1 end,case when id<=11 then 0 else 1 end,unlimited,true from halloween_private.products where campaign_id='halloween-2026-test';
 if not exists(select 1 from halloween_private.draw_pool(c) where product_id=1)then raise exception 'FAIL cupom ilimitado sem estoque numérico';end if;
 if (select count(*) from halloween_private.draw_pool(c)where product_id in(12,13)and chance_bps=50)<>2 then raise exception 'FAIL raros fixos';end if;
 t:=public.halloween_issue(c,'QA-REISSUE','QA Cupons',20000);
 update halloween_private.products set enabled=false where campaign_id=c and id<>1;
 r:=public.halloween_spin(t->>'token'); old_code:=r->>'code';
 if r->'offer'->>'benefit_value'<>'15' then raise exception 'FAIL desconto do sorteio';end if;
 if (select remaining from halloween_private.products where campaign_id=c and id=1)<>0 then raise exception 'FAIL cupom consumiu quantidade';end if;
 if public.halloween_spin(t->>'token')->>'code'<>old_code then raise exception 'FAIL resposta perdida duplicou resultado';end if;
 update halloween_private.products set enabled=true where campaign_id=c and id=2;
 replacement:=public.halloween_reissue(old_code,'Produto indisponível no balcão');
 replay:=public.halloween_reissue(old_code,'Produto indisponível no balcão');
 if replacement->>'id'<>replay->>'id' then raise exception 'FAIL reemissão duplicada';end if;
 if abs(extract(epoch from((replacement->>'expires_at')::timestamptz-clock_timestamp()))-172800)>10 then raise exception 'FAIL novas48h';end if;
 if public.halloween_ticket(t->>'token')->>'status'<>'available'then raise exception 'FAIL link original não recuperou giro';end if;
 if public.halloween_lookup(old_code)->'result'->>'status'<>'replaced'then raise exception 'FAIL cupom antigo não cancelado';end if;
 begin perform public.halloween_redeem(old_code);raise exception 'FAIL resgate cupom substituído';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 r:=public.halloween_spin(t->>'token');
 if (r->'offer'->>'id')::integer<>2 then raise exception 'FAIL repetiu item indisponível';end if;
 perform public.halloween_redeem_at(r->>'code',null);
 begin perform public.halloween_reissue(r->>'code','Tentativa depois de resgatar');raise exception 'FAIL reemissão após resgate';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 if has_function_privilege('anon','public.halloween_reissue(text,text)','execute')then raise exception 'FAIL reemissão pública';end if;
 -- Finite prize stock is returned once when the unused voucher is replaced.
 update halloween_private.products set enabled=false where campaign_id=c;
 update halloween_private.products set enabled=true,unlimited=false,quantity=1,remaining=1,benefit_value=100 where campaign_id=c and id=1;
 t:=public.halloween_issue(c,'QA-FINITE','QA Finito',20000);r:=public.halloween_spin(t->>'token');
 if (select remaining from halloween_private.products where campaign_id=c and id=1)<>0 then raise exception 'FAIL prêmio físico não reservado';end if;
 perform public.halloween_reissue(r->>'code','Indisponível nesta loja');perform public.halloween_reissue(r->>'code','Repetição da confirmação');
 if (select remaining from halloween_private.products where campaign_id=c and id=1)<>1 then raise exception 'FAIL devolução duplicada de estoque';end if;
 -- Server-side search reaches customers older than the first 500 records.
 insert into halloween_private.tickets(campaign_id,purchase_ref,customer,amount_cents,token_hash,created_by,created_at,expires_at)
 select c,'QAPAGE'||n,'QA Pessoa '||lpad(n::text,4,'0'),20000,encode(extensions.gen_random_bytes(32),'hex'),uid,clock_timestamp()+n*interval '1 second',clock_timestamp()+interval '48 hours' from generate_series(1,505)n;
 replay:=public.halloween_admin_state_v2(c,'QA Pessoa 0001',0);
 if (replay->>'clients_total')::integer<>1 or jsonb_array_length(replay->'clients')<>1 then raise exception 'FAIL busca acima500';end if;
 if jsonb_array_length(public.halloween_admin_state_v2(c,'QA Pessoa',0)->'clients')<>50 or jsonb_array_length(public.halloween_admin_state_v2(c,'QA Pessoa',500)->'clients')<>5 then raise exception 'FAIL paginação';end if;
 if (select active from halloween_private.campaigns where id='halloween-2026')then raise exception 'FAIL campanha real ativada';end if;
end $$;
select 'PASS descontos, ilimitado, raros fixos, retry, reemissão única, novas48h, link original, cupom cancelado, item excluído, resgate protegido, estoque finito e busca505' result;
rollback;
