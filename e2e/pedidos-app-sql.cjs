// PostgreSQL 17 EFÊMERO em /scratch; nunca executar com dados/credenciais reais.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Client } = require('pg');
const root = path.join(__dirname, '..');
const scratch = process.env.TMPDIR;
if (scratch !== '/scratch' || fs.existsSync('/mnt/d') || process.env.DATABASE_URL) throw Error('Use o runner isolado, sem credenciais.');
const dir = scratch + '/pg';
function tool(name, args) {
  const result = spawnSync(name, args, { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw Error(name + ': ' + result.stderr);
}
tool('initdb', ['-D', dir, '-U', 'fixture', '--no-locale', '--encoding=UTF8', '--auth=trust']);
tool('pg_ctl', ['-D', dir, '-l', scratch + '/postgres.log', '-o', '-k /scratch -p 5543 -c listen_addresses= -c shared_buffers=16MB -c max_connections=12 -c dynamic_shared_memory_type=mmap', 'start', '-w']);
const config = { host: scratch, port: 5543, user: 'fixture', database: 'postgres' };
const db = new Client(config);
after(async () => { await db.end(); tool('pg_ctl', ['-D', dir, 'stop', '-m', 'immediate', '-w']); });
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const pending = '00000000-0000-4000-8000-000000000005';
const blocked = '00000000-0000-4000-8000-000000000006';
const operadorA = '00000000-0000-4000-8000-000000000011';
const operadorB = '00000000-0000-4000-8000-000000000012';
const master = '00000000-0000-4000-8000-000000000013';
const semPermissao = '00000000-0000-4000-8000-000000000014';
const lojaA = '00000000-0000-4000-8000-000000000021';
const lojaB = '00000000-0000-4000-8000-000000000022';
let sequence = 0;
async function asRole(role, subject, sql, values = []) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw Error('Invalid fixture role');
  const client = new Client(config); await client.connect();
  try {
    await client.query('select set_config($1,$2,false)', ['request.jwt.claim.sub', subject ?? '']);
    await client.query('select set_config($1,$2,false)', ['request.jwt.claims', JSON.stringify({ sub: subject, email: 'teste@example.test' })]);
    await client.query('set role ' + role);
    return await client.query(sql, values);
  } finally { await client.end(); }
}
async function criar(subject = userA, itens = [{ id: 'peca', loja: 'Unidade A', quantidade: 1 }], chave = '__QA__' + String(++sequence).padStart(8, '0')) {
  const result = await asRole('authenticated', subject, 'select criar_pedido_app($1::jsonb,$2) id', [JSON.stringify(itens), chave]);
  return result.rows[0].id;
}
const confirmar = (id, unidade = 'Unidade A', operador = operadorA) => asRole('service_role', null, 'select confirmar_pedido_app_unidade($1,$2,$3)', [id, unidade, operador]);
const cancelar = (id, operador = operadorA) => asRole('service_role', null, 'select cancelar_pedido_app($1,$2)', [id, operador]);

test('fluxo SQL real com contas fictícias e sem caixa/estoque', async t => {
  await db.connect();
  await db.query(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon, authenticated, service_role;
    create table public.pessoas(id text primary key, ativo boolean, nao_vender boolean default false);
    create table public.lojas(id uuid primary key, nome text, ativa boolean);
    create table public.cargos(id uuid primary key, permissoes text[], is_master boolean, ativo boolean);
    create table public.perfis(id uuid primary key, permissoes text[], is_master boolean, ativo boolean, cargo_id uuid, lojas_permitidas uuid[]);
    create table public.catalogo_app(id text, loja text, nome text, preco numeric, estoque integer);
    create table public.caixas(id integer); insert into public.caixas values (7);
    create table public.vendas(id integer); insert into public.vendas values (8);
    create table public.lancamentos(id integer); insert into public.lancamentos values (9);
  `);
  const app = process.env.TECNOCELL_APP_MIGRATIONS;
  await db.query(fs.readFileSync(path.join(app, '2026-09-24-00-cadastros-clientes.sql'), 'utf8'));
  await db.query(fs.readFileSync(path.join(app, '2026-09-24-criar-pedido-app.sql'), 'utf8'));
  await db.query(fs.readFileSync(path.join(root, 'supabase/migrations/2026-10-05-vinculo-unico-conta-app.sql'), 'utf8'));
  const migration = fs.readdirSync(path.join(root, 'supabase/migrations')).find(n => n.endsWith('_pedidos_app_atendimento_sem_financeiro.sql'));
  await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', migration), 'utf8'));
  await t.test('migração cria somente o atendimento necessário', async () => {
    const result = await db.query("select to_regprocedure('public.confirmar_pedido_app_unidade(uuid,text,uuid)') is not null instalado");
    assert.equal(result.rows[0].instalado, true);
  });
  // Se a estrutura ainda não existe, encerra sem gerar falhas em cascata.
  if (!(await db.query("select to_regclass('public.pedidos_app_unidades') x")).rows[0].x) return;
  await db.query('insert into auth.users values ($1),($2),($3),($4)', [userA, userB, pending, blocked]);
  await db.query("insert into pessoas values ('p1',true,false),('p2',true,false)");
  await db.query("insert into cadastros_clientes(user_id,nome_completo,usuario,email,pessoa_id,status) values ($1,'Teste A','teste.a','a@example.test','p1','aprovado'),($2,'Teste B','teste.b','b@example.test','p2','aprovado'),($3,'Pendente','pendente','p@example.test',null,'pendente'),($4,'Bloqueado','bloqueado','b2@example.test',null,'bloqueado')", [userA, userB, pending, blocked]);
  await db.query("insert into lojas values ($1,'Loja A',true),($2,'Loja B',true)", [lojaA, lojaB]);
  await db.query("insert into pedidos_app_unidades values ('Unidade A',$1),('Unidade B',$2)", [lojaA, lojaB]);
  await db.query("insert into perfis values ($1,array['pdv'],false,true,null,array[$5]::uuid[]),($2,array['pdv'],false,true,null,array[$6]::uuid[]),($3,'{}',true,true,null,null),($4,'{}',false,true,null,null)", [operadorA, operadorB, master, semPermissao, lojaA, lojaB]);
  await db.query("insert into catalogo_app values ('peca','Unidade A','Peça',12.5,10),('peca','Unidade B','Peça',20,10)");

  await t.test('pendente e bloqueado não criam pedido', async () => {
    for (const id of [pending, blocked]) await assert.rejects(criar(id), { code: 'P0001' });
  });
  await t.test('preço vem do servidor e estoque insuficiente é recusado', async () => {
    const id = await criar(userA, [{ id: 'peca', loja: 'Unidade A', quantidade: 2, preco: 0.01 }]);
    assert.equal((await db.query('select total from pedidos_app where id=$1', [id])).rows[0].total, '25.00');
    await assert.rejects(criar(userA, [{ id: 'peca', loja: 'Unidade A', quantidade: 11 }]), { code: 'P0001' });
  });
  await t.test('duas requisições concorrentes geram um só pedido', async () => {
    const key = '__QA__concorrencia'; const a = [{ id: 'peca', loja: 'Unidade A', quantidade: 1 }];
    const ids = await Promise.all([criar(userA, a, key), criar(userA, a, key)]);
    assert.equal(ids[0], ids[1]);
    assert.equal(Number((await db.query('select count(*) from pedidos_app where chave_envio=$1', [key])).rows[0].count), 1);
  });
  await t.test('cliente não aprova a si mesmo nem lê pedido alheio', async () => {
    const id = await criar(userA);
    assert.equal((await asRole('authenticated', userB, 'select id from pedidos_app where id=$1', [id])).rowCount, 0);
    await assert.rejects(asRole('authenticated', userA, "update cadastros_clientes set status='aprovado' where user_id=$1", [userA]), { code: '42501' });
    for (const role of ['anon', 'authenticated']) await assert.rejects(asRole(role, userA, 'select confirmar_pedido_app_unidade($1,$2,$3)', [id, 'Unidade A', operadorA]), { code: '42501' });
  });
  await t.test('operador sem permissão e loja fora do acesso não confirmam', async () => {
    const id = await criar();
    await assert.rejects(confirmar(id, 'Unidade A', semPermissao), { code: 'P0001' });
    await assert.rejects(confirmar(id, 'Unidade A', operadorB), { code: 'P0001' });
  });
  await t.test('perfil inativo ou nulo é recusado; cargo ativo agrega permissões', async () => {
    for (const ativo of [false,null]) {
      await db.query('update perfis set ativo=$1 where id=$2',[ativo,operadorA]);
      await assert.rejects(confirmar(await criar()),{code:'P0001'});
    }
    const cargo='00000000-0000-4000-8000-000000000031';
    await db.query("insert into cargos values($1,array['pdv'],false,true)",[cargo]);
    await db.query("update perfis set ativo=true,cargo_id=$1,permissoes='{}' where id=$2",[cargo,operadorA]);
    await confirmar(await criar());
    await db.query('update cargos set ativo=false where id=$1',[cargo]);
    await assert.rejects(confirmar(await criar()),{code:'P0001'});
    await db.query("update perfis set cargo_id=null,permissoes=array['pdv'] where id=$1",[operadorA]);
  });
  await t.test('confirmações simultâneas e cancelamento concorrente preservam estado', async () => {
    const itens=[{id:'peca',loja:'Unidade A',quantidade:1},{id:'peca',loja:'Unidade B',quantidade:1}];
    const id=await criar(userA,itens);
    await Promise.all([confirmar(id),confirmar(id,'Unidade B',operadorB)]);
    assert.equal((await db.query('select status from pedidos_app where id=$1',[id])).rows[0].status,'confirmado');
    const outro=await criar();
    const resultados=await Promise.allSettled([confirmar(outro),cancelar(outro)]);
    assert.equal(resultados[1].status,'fulfilled');
    assert.deepEqual((await db.query('select status,status_pagamento from pedidos_app where id=$1',[outro])).rows[0],{status:'cancelado',status_pagamento:'pendente'});
  });
  await t.test('confirmar duas unidades agrega status sem alterar pagamento; repetição é idempotente', async () => {
    const id = await criar(userA, [{ id: 'peca', loja: 'Unidade A', quantidade: 1 }, { id: 'peca', loja: 'Unidade B', quantidade: 1 }]);
    await confirmar(id); await confirmar(id);
    assert.equal((await db.query('select status from pedidos_app where id=$1', [id])).rows[0].status, 'pendente');
    await confirmar(id, 'Unidade B', operadorB);
    const row = (await db.query('select status,status_pagamento from pedidos_app where id=$1', [id])).rows[0];
    assert.deepEqual(row, { status: 'confirmado', status_pagamento: 'pendente' });
    assert.equal(Number((await db.query('select count(*) from pedidos_app_atendimentos where pedido_id=$1', [id])).rows[0].count), 2);
    await assert.rejects(cancelar(id), { code: 'P0001' });
    await cancelar(id, master);
    assert.deepEqual((await db.query('select status,status_pagamento from pedidos_app where id=$1', [id])).rows[0], { status: 'cancelado', status_pagamento: 'pendente' });
  });
  await t.test('vínculo alterado, cadastro bloqueado e pessoa impedida não confirmam', async () => {
    for (const sql of ["update cadastros_clientes set status='bloqueado' where pessoa_id='p1'", "update pessoas set nao_vender=true where id='p1'", "update pessoas set ativo=false where id='p1'"]) {
      const id = await criar(); await db.query(sql);
      await assert.rejects(confirmar(id), { code: 'P0001' });
      await db.query("update cadastros_clientes set status='aprovado' where pessoa_id='p1'; update pessoas set ativo=true,nao_vender=false where id='p1'");
    }
  });
  await t.test('cancelamento repete sem cobrança; pedido pago é preservado', async () => {
    const id = await criar(); await cancelar(id); await cancelar(id);
    const paid = await criar(); await db.query("update pedidos_app set status_pagamento='pago' where id=$1", [paid]);
    await assert.rejects(cancelar(paid), { code: 'P0001' });
    assert.equal((await db.query('select status_pagamento from pedidos_app where id=$1', [paid])).rows[0].status_pagamento, 'pago');
  });
  await t.test('índice único impede duas contas ligadas à mesma pessoa', async () => {
    await assert.rejects(db.query("update cadastros_clientes set pessoa_id='p1' where user_id=$1", [userB]), { code: '23505' });
  });
  await t.test('sem venda, caixa, lançamentos, baixa de estoque ou gatilhos financeiros', async () => {
    assert.equal((await db.query('select array_agg(id) ids from caixas')).rows[0].ids[0], 7);
    assert.equal((await db.query('select array_agg(id) ids from vendas')).rows[0].ids[0], 8);
    assert.equal((await db.query('select array_agg(id) ids from lancamentos')).rows[0].ids[0], 9);
    assert.equal((await db.query('select min(estoque) n from catalogo_app')).rows[0].n, 10);
    assert.equal((await db.query("select count(*) from pg_trigger where tgname like 'pedido_app_%'")).rows[0].count, '0');
  });
});
