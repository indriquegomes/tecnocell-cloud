import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/2026-09-11_vales-por-loja.sql', 'utf8')

test('adiciona loja_id em creditos_clientes com índices', () => {
  assert.ok(sql.includes('add column if not exists loja_id uuid references public.lojas(id)'))
  assert.ok(sql.includes('creditos_clientes_pessoa_loja_idx'))
  assert.ok(sql.includes('creditos_clientes_loja_idx'))
})

test('backfill de Petrópolis com guarda de ambiguidade e relatório', () => {
  assert.ok(/from lojas where nome = 'Petrópolis'/i.test(sql))
  assert.ok(sql.includes("raise exception 'Loja \"Petrópolis\" ausente ou duplicada"))
  assert.ok(sql.includes('where loja_id is null and descricao ilike'))
  assert.ok(sql.includes('RELATÓRIO backfill vale'))
})

test('dropa assinaturas antigas sem loja e recria com loja', () => {
  assert.ok(sql.includes('drop function if exists public.receber_fiados_vale(text, jsonb, uuid, text)'))
  assert.ok(sql.includes('drop function if exists public.usar_credito_cliente(text, numeric, text)'))
  assert.ok(sql.includes('receber_fiados_vale(text, jsonb, uuid, uuid, text)'))
})

test('saldo sempre filtrado por pessoa_id + loja_id', () => {
  // todas as RPCs de saldo devem ter "and loja_id"
  assert.ok(/where pessoa_id = p_pessoa_id and loja_id = p_loja_id/i.test(sql))
  assert.ok(/where pessoa_id = v_c\.pessoa_id and loja_id = v_c\.loja_id/i.test(sql))
  assert.ok(/where pessoa_id = p_pessoa_id and loja_id = v_loja_id/i.test(sql))
})

test('receber_fiados_vale valida loja do fiado', () => {
  assert.ok(sql.includes("pertence a outra loja"))
  assert.ok(sql.includes('select d.loja_id into v_loja_lanc from vendas v join depositos d'))
})

test('finalizar_venda grava loja_id e registrar_devolucao tem guia de patch', () => {
  assert.ok(sql.includes('select loja_id into v_loja_id from depositos where id = p_deposito_id'))
  // registrar_devolucao NÃO é recriada aqui (corpo real só no banco) — tem guia MCP
  assert.ok(sql.includes('NÃO recriada aqui de propósito'))
  assert.ok(sql.includes('pg_get_functiondef'))
  assert.ok(sql.includes('loja_id = v_loja_id'))
})

test('revoke/grant no service_role', () => {
  assert.ok(sql.includes('revoke all on function public.receber_fiados_vale(text, jsonb, uuid, uuid, text)'))
  assert.ok(sql.includes('grant execute on function public.receber_fiados_vale(text, jsonb, uuid, uuid, text) to service_role'))
})
