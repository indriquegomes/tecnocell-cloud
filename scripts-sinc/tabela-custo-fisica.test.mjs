import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const path = 'supabase/migrations/2026-09-05_tabela_custo_consulta.sql'

test('migration cria tabela CUSTO física e sincronizada', () => {
  assert.ok(fs.existsSync(path), 'migration não existe')
  const sql = fs.readFileSync(path, 'utf8')
  assert.match(sql, /add column if not exists usa_preco_custo boolean not null default false/i)
  assert.match(sql, /unique[\s\S]*where usa_preco_custo/i)
  assert.match(sql, /insert into tabelas_preco[\s\S]*CUSTO/i)
  assert.match(sql, /insert into itens_tabela_preco[\s\S]*preco_custo/i)
  assert.match(sql, /create or replace function sincronizar_item_tabela_custo/i)
  assert.match(sql, /after insert or update of preco_custo, ativo on produtos/i)
})
