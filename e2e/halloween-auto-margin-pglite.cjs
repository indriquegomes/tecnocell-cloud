// PostgreSQL local; schema/functions reais da promoção, sem serviços ou finanças remotos.
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto')
const root = path.resolve(__dirname, '..')
;(async () => {
 let db
 if (process.env.HALLOWEEN_LOCAL_PG_URL) {
  const target = new URL(process.env.HALLOWEEN_LOCAL_PG_URL)
  if (target.hostname !== '127.0.0.1' || !/^\/halloween_test(?:_[a-z0-9_]+)?$/.test(target.pathname)) throw new Error('Local test database only')
  const client = new (require('pg').Client)({ connectionString: target.href })
  await client.connect()
  db = { exec: async sql => { const result = await client.query(sql); return Array.isArray(result) ? result : [result] }, close: () => client.end() }
 } else db = new PGlite({ extensions: { pgcrypto } })
 try {
  await db.exec(`do $$begin
   if not exists(select 1 from pg_roles where rolname='anon')then create role anon;end if;
   if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated;end if;
   if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role;end if;
   end $$;
   create schema extensions; create extension pgcrypto with schema extensions; create schema auth;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
   create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create table public.perfis(id uuid primary key,ativo boolean,is_master boolean,permissoes text[],cargo_id uuid);
   create table public.lojas(id uuid primary key,nome text,ativa boolean);
   create table public.depositos(id text primary key,loja_id uuid);
   create table public.pessoas(id text primary key,nome text);
   create table public.vendas(id uuid primary key,numero integer,total numeric,status text,created_at timestamptz,pessoa_id text,vendedor_id uuid,deposito_id text,uso_interno boolean,ml_order_id text);
   create table public.pagamentos_venda(venda_id uuid,valor numeric,taxa numeric default0,status text);
   create table public.lancamentos(venda_id uuid,tipo text,status text,valor numeric,valor_pago numeric default0,descricao text,pessoa_nome text,loja_id uuid,created_at timestamptz default now());
   create table public.ordens_servico(id uuid primary key,numero integer,pessoa_id text,pessoa_nome text,total numeric,status text,recebido_em timestamptz);
   insert into auth.users values('00000000-0000-4000-8000-000000000001');
   insert into public.perfis values('00000000-0000-4000-8000-000000000001',true,true,'{}',null);
   insert into auth.sessions values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',null);`.replaceAll('default0','default 0'))
  for (const file of ['e2e/halloween-baseline.sql','supabase/migrations/2026-10-22-halloween-automatic-sales.sql','supabase/migrations/2026-10-22-halloween-prize-probabilities.sql']) await db.exec(fs.readFileSync(path.join(root,file),'utf8'))
  const migration = path.join(root,'supabase/migrations/20261023180000_halloween_cupons_e_reemissao.sql')
  if (fs.existsSync(migration)) await db.exec(fs.readFileSync(migration,'utf8'))
  const result = await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-coupons-check.sql'),'utf8'))
  for (const item of result) for (const row of item.rows ?? []) console.log(JSON.stringify(row))
  // Local-only financial fixtures: never run this file against the real Cloud.
  const finance = await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-sales-local-check.sql'),'utf8'))
  for (const item of finance) for (const row of item.rows ?? []) console.log(JSON.stringify(row))
  await db.exec(`alter table public.pagamentos_venda add column created_at timestamptz default clock_timestamp();
   alter table public.lancamentos add column id text primary key default gen_random_uuid()::text;
   alter table public.lancamentos add column data_pagamento timestamptz;
   alter table public.lancamentos add column historico_pagamentos jsonb default '[]';
   alter table public.ordens_servico add column created_at timestamptz default clock_timestamp();
   alter table public.ordens_servico add column deposito_id text;`)
  const next=path.join(root,'supabase/migrations/20261023220000_halloween_quitacao_os_manual.sql');
  if(fs.existsSync(next))await db.exec(fs.readFileSync(next,'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-coupons-check.sql'),'utf8'));
  for(const item of await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-payment-proof-check.sql'),'utf8')))for(const row of item.rows??[])console.log(JSON.stringify(row));
  if(process.argv.includes('--receipt')) {
   await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261024020821_halloween_configure_alias.sql'),'utf8'));
   await db.exec('alter table public.lojas add column whatsapp text');
   await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261024061236_halloween_result_receipt_store.sql'),'utf8'));
   for(const item of await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-receipt-store-check.sql'),'utf8')))for(const row of item.rows??[])console.log(JSON.stringify(row));
   await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-coupons-check.sql'),'utf8'));
   await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-payment-proof-check.sql'),'utf8'));
   for(const item of await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-current-probability-check.sql'),'utf8')))for(const row of item.rows??[])console.log(JSON.stringify(row));
   console.log('PASS regressão após contato: cupons, reemissão, resgate e quitação permanecem preservados.');
  }
  await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-auto-margin-fixture.sql'),'utf8'));
 const refundSource=fs.readFileSync(path.join(root,'supabase/migrations/20261020123000_conciliacao_pix_devolucoes.sql'),'utf8');
 await db.exec(refundSource.slice(refundSource.indexOf('CREATE OR REPLACE FUNCTION public.registrar_devolucao'),refundSource.lastIndexOf('commit;')));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261024190000_halloween_auto_margin.sql'),'utf8'));
 for(const item of await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-auto-margin-check.sql'),'utf8')))for(const row of item.rows??[])console.log(JSON.stringify(row));
 await db.exec("update public.lojas set nome=case when id='aaaaaaaa-0000-4000-8000-000000000001'then 'Petrópolis'else 'Teresópolis'end where id in('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002')");
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261024200000_halloween_store_prizes.sql'),'utf8'));
 for(const item of await db.exec(fs.readFileSync(path.join(root,'e2e/halloween-store-prizes-check.sql'),'utf8')))for(const row of item.rows??[])console.log(JSON.stringify(row));
 } finally { await db.close() }
})().catch(e=>{console.error(e.message);process.exitCode=1})
