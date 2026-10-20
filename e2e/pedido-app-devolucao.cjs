const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

test('devolução parcial mantém pedido; integral encerra sem movimentar estoque ou financeiro', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table pedidos_app(id uuid primary key,status text,status_pagamento text,itens jsonb default '[{"loja":"Petrópolis"}]');
      create table pedidos_app_atendimentos(pedido_id uuid,unidade text,venda_id uuid);
      create table vendas(id uuid primary key,status text);
      create table itens_venda(venda_id uuid,produto_id text,quantidade numeric);
      create table devolucoes(id uuid primary key,venda_id uuid,status text);
      create table itens_devolucao(devolucao_id uuid,produto_id text,quantidade numeric);
      create table lancamentos(venda_id uuid,tipo text,status text);
      insert into pedidos_app(id,status,status_pagamento) values ('00000000-0000-4000-8000-000000000001','confirmado','pago');
      insert into vendas values ('00000000-0000-4000-8000-000000000002','concluida');
      insert into pedidos_app_atendimentos values ('00000000-0000-4000-8000-000000000001','Petrópolis','00000000-0000-4000-8000-000000000002');
      insert into itens_venda values ('00000000-0000-4000-8000-000000000002','peca',2);
      insert into devolucoes values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','concluida');
    `)
    const dir = path.join(__dirname, '../supabase/migrations')
    const file = fs.readdirSync(dir).find(f => f.endsWith('_pedido_app_devolucao_integral.sql'))
    assert.ok(file, 'migration incremental deve existir')
    await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'))
    await db.exec("insert into itens_devolucao values ('00000000-0000-4000-8000-000000000003','peca',1)")
    assert.equal((await db.query('select status from pedidos_app')).rows[0].status, 'confirmado')
    await db.exec("insert into itens_devolucao values ('00000000-0000-4000-8000-000000000003','peca',1)")
    assert.deepEqual((await db.query('select status,status_pagamento from pedidos_app')).rows[0], {status:'cancelado',status_pagamento:'pendente'})
    assert.equal((await db.query('select status from vendas')).rows[0].status, 'concluida')
    // Outra unidade ativa impede o cancelamento do pedido inteiro.
    await db.exec(`
      insert into vendas values ('00000000-0000-4000-8000-000000000004','concluida');
      insert into itens_venda values ('00000000-0000-4000-8000-000000000004','outra',1);
      insert into pedidos_app_atendimentos values ('00000000-0000-4000-8000-000000000001','Outra','00000000-0000-4000-8000-000000000004');
      update itens_devolucao set quantidade=quantidade;
    `)
    assert.equal((await db.query('select status from pedidos_app')).rows[0].status, 'pendente')
  } finally { await db.close() }
})
