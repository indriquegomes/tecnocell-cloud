// Called only by the guarded local PostgreSQL harness. Never use company services.
const assert = require('node:assert/strict')
const { Client } = require('pg')
module.exports = async function concurrency(url) {
 const target = new URL(url)
 if (target.hostname !== '127.0.0.1' || !/^\/halloween_test(?:_[a-z0-9_]+)?$/.test(target.pathname)) throw new Error('Local test database only')
 const clients = [new Client({ connectionString: url }), new Client({ connectionString: url })]
 const [a, b] = clients
 try {
  await Promise.all(clients.map(c => c.connect()))
  for (const c of clients) await c.query(`select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',false)`)
  const { rows: [ids] } = await a.query(`select gen_random_uuid() st,gen_random_uuid() os,gen_random_uuid() receipt`)
  await a.query(`insert into public.lojas values($1,'Concurrency QA',true);`, [ids.st])
  await a.query(`insert into public.depositos values('concurrent-dep',$1)`, [ids.st])
  await a.query(`insert into public.pessoas values('concurrent-person','Cliente QA');
   insert into halloween_private.campaigns(id,title,active,stock_confirmed,test_mode)values('qa-concurrent','QA concurrent',true,true,true);
   insert into halloween_private.sale_windows(campaign_id,started_at)values('qa-concurrent',clock_timestamp()-interval '1 day');
   insert into halloween_private.products(campaign_id,id,name,benefit_type,benefit_value,weight,unlimited,quantity,remaining)values('qa-concurrent',1,'Cupom QA','percent',15,10000,true,0,0);`)
  await a.query(`insert into public.ordens_servico(id,numero,pessoa_id,pessoa_nome,total,status,created_at,recebido_em,deposito_id)
   values($1,9901,'concurrent-person','Cliente QA',250,'entregue',clock_timestamp()-interval '2 hours',date_trunc('minute',clock_timestamp()-interval '1 hour'),'concurrent-dep')`, [ids.os])
  await a.query(`insert into public.lancamentos(id,tipo,status,valor,pessoa_nome,loja_id,descricao,created_at,data_pagamento)
   select $1,'receber','pago',250,'Cliente QA',$2,'Recebimento OS #9901',recebido_em,recebido_em from public.ordens_servico where id=$3`, [ids.receipt, ids.st, ids.os])
  const paid = (await a.query('select recebido_em from public.ordens_servico where id=$1', [ids.os])).rows[0].recebido_em
  const issueSql = `select public.halloween_issue_os_manual('qa-concurrent',$1,array[$2]::text[],$3,'Conferido em teste local',true) result`
  const issued = await Promise.all([a.query(`select halloween_private.capture_os('qa-concurrent',$1) id`, [ids.os]), b.query(issueSql, [ids.os, ids.receipt, paid])])
  const original = issued[1].rows[0].result
  assert.equal(issued[0].rows[0].id, original.id)
  assert.equal((await a.query(`select count(*)::int n from halloween_private.tickets where campaign_id='qa-concurrent'and replaces_coupon_id is null`)).rows[0].n, 1)
  const spins = await Promise.all(clients.map(c => c.query('select public.halloween_spin($1) result', [original.token])))
  const code = spins[0].rows[0].result.code
  assert.equal(spins[1].rows[0].result.code, code, 'double spin returns same coupon')
  const race = await Promise.allSettled([
   a.query('select public.halloween_redeem_at($1,$2)', [code, ids.st]),
   b.query('select public.halloween_reissue($1,$2)', [code, 'Produto indisponível em teste local'])
  ])
  assert.equal(race.filter(x => x.status === 'fulfilled').length, 1, 'only one redeem/reissue wins')
  const state = (await a.query('select redeemed_at,voided_at from halloween_private.coupons where code=$1', [code])).rows[0]
  assert.ok(Boolean(state.redeemed_at) !== Boolean(state.voided_at))
  const next = (await a.query('select gen_random_uuid() os,gen_random_uuid() receipt')).rows[0]
  await a.query(`insert into public.ordens_servico(id,numero,pessoa_id,pessoa_nome,total,status,created_at,recebido_em,deposito_id)
   values($1,9902,'concurrent-person','Cliente QA',250,'entregue',$2::timestamptz-interval '1 hour',$2,'concurrent-dep')`, [next.os, paid])
  await a.query(`insert into public.lancamentos(id,tipo,status,valor,pessoa_nome,loja_id,created_at,data_pagamento)values($1,'receber','pago',250,'Cliente QA',$2,$3,$3)`, [next.receipt, ids.st, paid])
  const nextTicket = (await a.query(issueSql, [next.os, next.receipt, paid])).rows[0].result
  const nextCode = (await a.query('select public.halloween_spin($1) result', [nextTicket.token])).rows[0].result.code
  await b.query('begin')
  await b.query(`update public.lancamentos set status='cancelado'where id=$1`, [next.receipt])
  const redeemAfterCancellation = a.query('select public.halloween_redeem_at($1,$2)', [nextCode, ids.st]).then(() => ({ ok: true }), error => ({ ok: false, code: error.code }))
  await new Promise(resolve => setTimeout(resolve, 150))
  await b.query('commit')
  assert.equal((await redeemAfterCancellation).ok, false, 'receipt invalidation committed during redemption must block benefit')
  assert.equal((await a.query('select redeemed_at from halloween_private.coupons where code=$1', [nextCode])).rows[0].redeemed_at, null)
  await a.query('begin')
  await a.query(`select 1 from halloween_private.campaigns where id='qa-concurrent' for update`)
  const started = Date.now()
  await assert.rejects(b.query(issueSql, [ids.os, ids.receipt, paid]), e => e.code === '55P03')
  assert.ok(Date.now() - started >= 2500 && Date.now() - started < 6000, 'promotion lock timeout must be 3s')
  await a.query('rollback')
  // The direct SQL entry point sets timeout before the statement, as documented.
  await b.query('begin'); await b.query(`set local statement_timeout='10s'`)
  const timeoutStarted = Date.now()
  await assert.rejects(b.query('select pg_sleep(11)'), e => e.code === '57014')
  assert.ok(Date.now() - timeoutStarted >= 9500 && Date.now() - timeoutStarted < 13000)
  await b.query('rollback')
  console.log('PASS real PostgreSQL multiple connections: auto/manual uniqueness, double spin, redeem/reissue race, 3s lock timeout and 10s SQL statement timeout')
 } finally {
  for (const c of clients) { await c.query('rollback').catch(() => {}); await c.end().catch(() => {}) }
 }
}
