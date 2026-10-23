-- LOCAL ONLY, never execute these financial fixtures against company services.
begin;
do $$
declare c text:='qa-proof'; u uuid:='00000000-0000-4000-8000-000000000001'; st uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); o2 uuid:=gen_random_uuid(); tid uuid; rec text; r1 text; r2 text; paid timestamptz:=clock_timestamp()-interval '1 hour'; x jsonb;
begin
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 insert into public.lojas values(st,'QA Proof',true);
 insert into public.depositos values('proof-dep',st);insert into public.pessoas values('proof-person','Pessoa QA');
 insert into halloween_private.campaigns(id,title,active,stock_confirmed)values(c,'QA proof',true,true);
 insert into halloween_private.sale_windows(campaign_id,started_at)values(c,clock_timestamp()-interval '4 days');
 insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,unlimited,quantity,remaining)values(c,1,'Cupom','percent',15,10000,true,0,0);
 insert into public.vendas(id,numero,total,status,created_at,pessoa_id,vendedor_id,deposito_id)values(v,9001,200,'concluida',clock_timestamp()-interval '60 hours','proof-person',u,'proof-dep');
 insert into public.pagamentos_venda(venda_id,valor,status,created_at)values(v,50,'pago',clock_timestamp()-interval '60 hours'),(v,150,'pendente',clock_timestamp()-interval '60 hours');
 insert into public.lancamentos(venda_id,tipo,status,valor,valor_pago,created_at,data_pagamento,historico_pagamentos)values
 (v,'receber','pago',50,0,clock_timestamp()-interval '60 hours',clock_timestamp()-interval '60 hours','[]'),
 (v,'receber','pago',150,150,clock_timestamp()-interval '60 hours',paid,jsonb_build_array(jsonb_build_object('valor',150,'data',paid)));
 select to_jsonb(s)into x from public.vendas s where s.id=v;
 tid:=halloween_private.capture_sale(c,x,'Pessoa QA');
 if tid is null then raise exception 'FAIL settled60h-old purchase must issue';end if;
 if abs(extract(epoch from((select expires_at from halloween_private.tickets where id=tid)-paid-interval '48 hours')))>1 then raise exception 'FAIL validity must start at settlement';end if;
 if halloween_private.capture_sale(c,x,'Pessoa QA')<>tid then raise exception 'FAIL duplicate sale';end if;
 insert into public.ordens_servico(id,numero,pessoa_id,pessoa_nome,total,status,recebido_em,created_at,deposito_id)values(o,9002,'proof-person','Pessoa QA',250,'entregue',paid,paid-interval '1 hour','proof-dep'),(o2,9003,'proof-person','Pessoa QA',250,'entregue',paid,paid-interval '1 hour','proof-dep');
 insert into public.lancamentos(tipo,status,valor,pessoa_nome,loja_id,created_at,data_pagamento)values('receber','pago',250,'Cadastro divergente',st,paid,paid)returning id into rec;
 x:=public.halloween_issue_os_manual(c,o,array[rec],paid,'Conferência comprovada no balcão',true);tid:=(x->>'id')::uuid;
 if tid is null or not halloween_private.sale_valid(tid)then raise exception 'FAIL manual OS invalidated by old heuristic';end if;
 update public.lancamentos set data_pagamento=paid+interval '5 days'where id=rec;
 if halloween_private.sale_valid(tid)then raise exception 'FAIL changed payment chronology';end if;
 update public.lancamentos set data_pagamento=paid where id=rec;
 update public.ordens_servico set created_at=created_at-interval '1 day'where id=o;
 if halloween_private.sale_valid(tid)then raise exception 'FAIL changed source chronology';end if;
 update public.ordens_servico set created_at=paid-interval '1 hour'where id=o;
 if public.halloween_issue_os_manual(c,o,array[rec],paid,'Repetição idempotente',true)->>'id'<>tid::text then raise exception 'FAIL duplicate OS';end if;
 begin perform public.halloween_issue_os_manual(c,o2,array[rec],paid,'Tentativa reutilizar recebimento',true);raise exception 'FAIL reused receipt';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 -- Legacy OS tickets have no proof row; their recognized receipt cannot be reused.
 delete from halloween_private.payment_claims where campaign_id=c and receipt_id=rec;
 update halloween_private.tickets set proof_id=null where id=tid;
 update public.lancamentos set descricao='Recebimento OS #9002',pessoa_nome='Pessoa QA'where id=rec;
 begin perform public.halloween_issue_os_manual(c,o2,array[rec],paid,'Reutilização de emissão legada',true);raise exception 'FAIL reused legacy receipt';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 update halloween_private.tickets set proof_id=(select id from halloween_private.payment_proofs where campaign_id=c and source_id=o)where id=tid;
 insert into halloween_private.payment_claims select c,rec,proof_id from halloween_private.tickets where id=tid;
 x:=public.halloween_spin(x->>'token');
 x:=public.halloween_reissue(x->>'code','Segundo comprovante de indisponibilidade');
 if not halloween_private.sale_valid((x->>'id')::uuid)or(select proof_id from halloween_private.tickets where id=(x->>'id')::uuid)is distinct from(select proof_id from halloween_private.tickets where id=tid)then raise exception 'FAIL replacement lost financial proof';end if;
 update public.ordens_servico set status='cancelada'where id=o;
 if halloween_private.sale_valid(tid)then raise exception 'FAIL canceled manual OS';end if;
 -- Canceling a source releases a finite reservation exactly once, even before expiry.
 insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,unlimited,quantity,remaining)
 values(c,12,'Brinde QA','percent',100,50,false,1,0);
 insert into halloween_private.coupons(ticket_id,campaign_id,product_id,offer,code,expires_at)
 values((x->>'id')::uuid,c,12,'{}','QA-CANCELED-RESERVATION',paid+interval '48 hours');
 perform halloween_private.sync_sales();
 if(select remaining from halloween_private.products where campaign_id=c and id=12)<>1 then raise exception 'FAIL canceled source did not release reservation';end if;
 perform halloween_private.sync_sales();
 if(select remaining from halloween_private.products where campaign_id=c and id=12)<>1 then raise exception 'FAIL canceled source released reservation twice';end if;
 if has_function_privilege('anon','public.halloween_issue_os_manual(text,uuid,text[],timestamp with time zone,text,boolean)','execute')then raise exception 'FAIL anonymous manual issue';end if;

 -- Explicit campaign endpoints, including delayed reconciliation in November.
 update halloween_private.campaigns set starts_at='2026-10-26 00:00-03',ends_at='2026-11-01 00:00-03'where id=c;
 if halloween_private.proof_window(c,'2026-10-26 10:00-03','2026-10-31 23:50-03','2026-11-01 09:00-03')is distinct from true then raise exception 'FAIL valid late reconciliation';end if;
 if halloween_private.proof_window(c,'2026-10-30 10:00-03','2026-11-01 00:05-03','2026-11-01 09:00-03')then raise exception 'FAIL November settlement accepted';end if;
 if halloween_private.proof_window(c,'2026-10-25 10:00-03','2026-10-27 10:00-03','2026-10-27 11:00-03')then raise exception 'FAIL pre-campaign purchase';end if;
 if halloween_private.proof_window(c,'2026-10-26 10:00-03','2026-10-31 23:50-03','2026-11-02 23:50-03')then raise exception 'FAIL expiry boundary';end if;
 update halloween_private.campaigns set starts_at=null,ends_at=null where id=c;
 if halloween_private.payment_timestamp('2026-10-27')is not null then raise exception 'FAIL invented midnight';end if;
 if halloween_private.payment_timestamp('2026-10-27T15:40:00')is distinct from '2026-10-27 15:40-03'::timestamptz then raise exception 'FAIL credit timezone';end if;
 -- Split receipts require their combined total and explicit, compatible payment time.
 insert into public.lancamentos(tipo,status,valor,loja_id,created_at,data_pagamento)values('receber','pago',100,st,paid,paid)returning id into r1;
 insert into public.lancamentos(tipo,status,valor,loja_id,created_at,data_pagamento)values('receber','pago',150,st,paid,paid)returning id into r2;
 begin perform public.halloween_issue_os_manual(c,o2,array[r1],paid,'Pagamento insuficiente',true);raise exception 'FAIL insufficient receipts';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 begin perform public.halloween_issue_os_manual(c,o2,array[r1,r2],clock_timestamp()+interval '1 hour','Horário futuro inválido',true);raise exception 'FAIL future timestamp';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 begin perform public.halloween_issue_os_manual(c,o2,array[r1,r2],paid-interval '1 day','Dia divergente inválido',true);raise exception 'FAIL different payment day';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 update halloween_private.campaigns set starts_at=paid-interval '30 minutes'where id=c;
 begin perform public.halloween_issue_os_manual(c,o2,array[r1,r2],paid,'OS aberta antes da campanha',true);raise exception 'FAIL pre-campaign OS';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 update halloween_private.campaigns set starts_at=null where id=c;
 x:=public.halloween_issue_os_manual(c,o2,array[r1,r2],paid,'Dois recebimentos conferidos',true);tid:=(x->>'id')::uuid;
 if not halloween_private.sale_valid(tid)or not exists(select 1 from halloween_private.payment_proofs where source_id=o2 and actor=u and cardinality(receipt_ids)=2 and reason='Dois recebimentos conferidos')then raise exception 'FAIL split receipt proof/audit';end if;
 update public.lancamentos set status='cancelado'where id=r2;
 if halloween_private.sale_valid(tid)then raise exception 'FAIL canceled split receipt';end if;
 begin perform public.halloween_spin(x->>'token');raise exception 'FAIL invalid proof spun';exception when others then if sqlerrm like 'FAIL%'then raise;end if;end;
 -- Unknown final payment time must require an auditable confirmation.
 v:=gen_random_uuid();
 insert into public.vendas(id,numero,total,status,created_at,pessoa_id,vendedor_id,deposito_id)values(v,9004,200,'concluida',paid-interval '1 hour','proof-person',u,'proof-dep');
 insert into public.pagamentos_venda(venda_id,valor,status)values(v,200,'pendente');
 insert into public.lancamentos(venda_id,tipo,status,valor,valor_pago,created_at,data_pagamento,historico_pagamentos)
 values(v,'receber','pago',200,200,paid-interval '1 hour',date_trunc('day',paid at time zone 'America/Sao_Paulo')at time zone 'UTC','[]')returning id into rec;
 if halloween_private.sale_payment_proof(v)->>'status'<>'needs_time'then raise exception 'FAIL guessed payment time';end if;
 x:=public.halloween_payment_pending(c,0);
 if not exists(select 1 from jsonb_array_elements(x)y where y->>'id'=v::text)then raise exception 'FAIL missing pending payment';end if;
 x:=public.halloween_confirm_sale_time(c,v,paid,'Horário conferido no comprovante',true);tid:=(x->>'id')::uuid;
 if not halloween_private.sale_valid(tid)then raise exception 'FAIL confirmed sale not valid';end if;
 if public.halloween_confirm_sale_time(c,v,paid+interval '5 minutes','Tentativa renovar por outro clique',true)->>'id'<>tid::text then raise exception 'FAIL manual repeat duplicated ticket';end if;
 if (select expires_at from halloween_private.tickets where id=tid)<>(select paid_at+interval '48 hours'from halloween_private.payment_proofs where id=(select proof_id from halloween_private.tickets where id=tid))then raise exception 'FAIL manual click renewed validity';end if;
 update public.lancamentos set status='pendente',valor_pago=100 where id=rec;
 if halloween_private.sale_valid(tid)then raise exception 'FAIL new outstanding debt';end if;
 -- A late-entered receipt remains reviewable when its recorded payment day is valid.
 update public.lancamentos set status='pago',valor_pago=200,created_at=clock_timestamp()+interval '1 day'where id=rec;
 update halloween_private.campaigns set starts_at=paid-interval '2 hours',ends_at=paid+interval '2 hours'where id=c;
 x:=public.halloween_payment_review(c,'sale',9004);
 if not exists(select 1 from jsonb_array_elements(x->'receipts')r where r->>'id'=rec)then raise exception 'FAIL late-entered receipt hidden';end if;
 -- Staff privilege alone without a valid Cloud session is insufficient.
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.halloween_payment_review(c,'os',9002);raise exception 'FAIL missing session accepted';exception when insufficient_privilege then null;end;

end $$;
select 'PASS settlement48h, late settlement, immutable retry, manual OS, receipt reuse, cancellation, ACL' result;
rollback;
