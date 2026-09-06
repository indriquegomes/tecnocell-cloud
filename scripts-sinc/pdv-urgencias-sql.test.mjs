import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/2026-09-06_pdv_desconto_item_recebimento_lote.sql', 'utf8')

test('venda preserva desconto unitario e total liquido', () => {
  assert.match(sql, /finalizar_venda_com_desconto_item/i)
  assert.match(sql, /desconto_item\s*=\s*coalesce/i)
  assert.match(sql, /total_item\s*=.*quantidade[\s\S]*preco_unitario[\s\S]*desconto_item/i)
})

test('recebimento em lote trava dividas e grava caixa na mesma transacao', () => {
  assert.match(sql, /receber_lancamentos_lote/i)
  assert.match(sql, /from lancamentos[\s\S]*for update/i)
  assert.match(sql, /insert into movimentos_caixa/i)
})
