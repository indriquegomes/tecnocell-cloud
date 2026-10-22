-- Transactional probability regression; no financial sale or real campaign stock is created.
begin;
do $$
declare c text:='halloween-probability-qa'; v_user uuid; v_session uuid; t jsonb; r jsonb; total numeric; before_count integer;
begin
 select s.user_id,s.id into v_user,v_session from auth.sessions s join halloween_private.staff h on h.user_id=s.user_id join public.perfis p on p.id=s.user_id where h.enabled and p.ativo is distinct from false and (s.not_after is null or s.not_after>clock_timestamp()) limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'session_id',v_session,'role','authenticated')::text,true);
 insert into halloween_private.campaigns(id,title,test_mode,active,stock_confirmed)values(c,'Probability QA',true,true,true);
 insert into halloween_private.products select c,id,name,benefit_type,benefit_value,weight,10,10 from halloween_private.products where campaign_id='halloween-2026-test';
 if (select sum(weight) from halloween_private.products where campaign_id=c)<>10000 then raise exception 'FAIL initial total';end if;
 if (select count(*) from halloween_private.products where campaign_id=c and id<=11 and benefit_type='percent' and benefit_value=100)<>11 then raise exception 'FAIL free products';end if;
 if (select count(*) from halloween_private.draw_pool(c) where product_id in(12,13) and chance_bps=50)<>2 then raise exception 'FAIL rare initial';end if;
 select sum(chance_bps) into total from halloween_private.draw_pool(c);
 if abs(total-10000)>.000001 then raise exception 'FAIL pool total';end if;
 update halloween_private.products set remaining=0 where campaign_id=c and id in(1,2,3,4,5);
 if (select count(*) from halloween_private.draw_pool(c) where product_id in(12,13) and chance_bps=50)<>2 then raise exception 'FAIL rare changed after depletion';end if;
 select sum(chance_bps) into total from halloween_private.draw_pool(c);if abs(total-10000)>.000001 then raise exception 'FAIL redistribution';end if;
 update halloween_private.products set remaining=0 where campaign_id=c and id=12;
 if (select chance_bps from halloween_private.draw_pool(c) where product_id=13)<>50 then raise exception 'FAIL surviving rare increased';end if;
 if exists(select 1 from halloween_private.draw_pool(c) where product_id=12) then raise exception 'FAIL exhausted prize drawn';end if;
 update halloween_private.products set remaining=0 where campaign_id=c and id not in(12,13);
 if exists(select 1 from halloween_private.draw_pool(c)) then raise exception 'FAIL rare-only pool';end if;
 t:=public.halloween_issue(c,'PROB-EMPTY','QA',20000);
 begin perform public.halloween_spin(t->>'token');raise exception 'FAIL rare-only draw';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 if exists(select 1 from halloween_private.coupons where ticket_id=(t->>'id')::uuid) then raise exception 'FAIL ticket consumed';end if;
 update halloween_private.products set remaining=0 where campaign_id=c;
 update halloween_private.products set remaining=10 where campaign_id=c and id=1;
 r:=public.halloween_spin(t->>'token');
 if r->'offer'->>'benefit_value'<>'100' or (r->'offer'->>'id')::integer<>1 then raise exception 'FAIL free snapshot';end if;
 if public.halloween_spin(t->>'token')->>'code'<>r->>'code' then raise exception 'FAIL replay';end if;
 if has_function_privilege('anon','halloween_private.draw_pool(text)','execute') then raise exception 'FAIL public pool helper';end if;
 if (select active from halloween_private.campaigns where id='halloween-2026') then raise exception 'FAIL real campaign activated';end if;
end $$;
select 'PASS: free prizes, fixed rare0.5%, redistribution, exhausted exclusion, rare-only block, ticket preserved, replay, private helper' result;
rollback;
