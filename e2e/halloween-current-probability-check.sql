-- Probabilidades nas regras atuais: 11 descontos e2 brindes, sem alterar pesos.
begin;
do $$
declare c text:='__QA__probability_current'; t jsonb; total numeric; common_count integer;
begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 insert into halloween_private.campaigns(id,title,test_mode,active,stock_confirmed)values(c,'__QA__ Probabilidade atual',true,true,true);
 insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,quantity,remaining,unlimited,enabled)
 select c,id,name,benefit_type,benefit_value,weight,case when id>=12 then 1 else 0 end,case when id>=12 then 1 else 0 end,unlimited,true from halloween_private.products where campaign_id='halloween-2026-test';
 select count(*) into common_count from halloween_private.draw_pool(c)where product_id<=11;
 if common_count<>11 then raise exception 'FAIL cupom comum dependeu de quantidade numérica';end if;
 if (select count(*)from halloween_private.draw_pool(c)where product_id in(12,13)and chance_bps=50)<>2 then raise exception 'FAIL raro não está em0,5 por cento';end if;
 select sum(chance_bps)into total from halloween_private.draw_pool(c);if abs(total-10000)>.000001 then raise exception 'FAIL total inicial';end if;
 update halloween_private.products set enabled=false where campaign_id=c and id in(1,2,3,4,5);
 if (select count(*)from halloween_private.draw_pool(c)where product_id in(12,13)and chance_bps=50)<>2 then raise exception 'FAIL raro aumentou após exclusões';end if;
 select sum(chance_bps)into total from halloween_private.draw_pool(c);if abs(total-10000)>.000001 then raise exception 'FAIL redistribuição';end if;
 update halloween_private.products set remaining=0 where campaign_id=c and id=12;
 if exists(select 1 from halloween_private.draw_pool(c)where product_id=12)or(select chance_bps from halloween_private.draw_pool(c)where product_id=13)<>50 then raise exception 'FAIL raro esgotado alterou o sobrevivente';end if;
 if (select sum(chance_bps)from halloween_private.draw_pool(c)where product_id<=11)<>9950 then raise exception 'FAIL parcela rara não retornou aos comuns';end if;
 update halloween_private.products set enabled=false where campaign_id=c and id<=11;
 if exists(select 1 from halloween_private.draw_pool(c))then raise exception 'FAIL só raros permitido';end if;
 t:=public.halloween_issue(c,'__QA__rare_only','__QA__ Cliente',20000);
 begin perform public.halloween_spin(t->>'token');raise exception 'FAIL giro só raros aceito';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 if exists(select 1 from halloween_private.coupons where ticket_id=(t->>'id')::uuid)then raise exception 'FAIL giro consumido sem comuns';end if;
 update halloween_private.products set enabled=true where campaign_id=c and id=9;
 if(select chance_bps from halloween_private.draw_pool(c)where product_id=9)<>9950 then raise exception 'FAIL restauração do comum';end if;
end $$;
select 'PASS probabilidades atuais: descontos ilimitados, raros0,5%, redistribuição, esgotamento, sem comuns não consome giro' result;
rollback;
