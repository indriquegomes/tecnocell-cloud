import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync('supabase/migrations/2026-09-11_receber_fiados_vale.sql', 'utf8')

test('RPC receber_fiados_vale existe e vincula uso ao lançamento', () => {
  assert.ok(sql.includes('create or replace function public.receber_fiados_vale'))
  assert.ok(sql.includes('alter table public.creditos_clientes add column if not exists lancamento_id text'))
  assert.ok(sql.includes('lancamento_id'))
})

test('trava pessoa e lancamentos com FOR UPDATE na mesma transação', () => {
  assert.ok(/from pessoas[\s\S]*for update/i.test(sql))
  assert.ok(/from lancamentos l[\s\S]*for update/i.test(sql))
})

test('idempotência reusa recebimentos_lote_operacoes', () => {
  assert.ok(sql.includes('recebimentos_lote_operacoes'))
  assert.ok(sql.includes('resultado is not null then return'))
})

test('grava histórico com forma/operacao_id/usuario e data de São Paulo', () => {
  assert.ok(sql.includes("'forma', 'Vale Crédito'"))
  assert.ok(sql.includes("'operacao_id', p_operacao_id::text"))
  assert.ok(sql.includes("'usuario', coalesce(p_usuario"))
  assert.ok(sql.includes('America/Sao_Paulo'))
})

test('valida saldo, cliente e restante (rollback total em erro)', () => {
  assert.ok(sql.includes('Saldo de crédito insuficiente'))
  assert.ok(sql.includes('pertence a outro cliente'))
  assert.ok(sql.includes('não tem cliente identificado'))
  assert.ok(sql.includes('Valor maior que saldo da dívida'))
})

test('NÃO cria movimentos_caixa nem exige caixa aberto', () => {
  assert.ok(!/insert\s+into\s+(public\.)?movimentos_caixa/i.test(sql))
  assert.ok(!sql.includes('from caixas'))
})

test('revoga de public/anon/authenticated e libera só service_role', () => {
  assert.ok(sql.includes('revoke all on function public.receber_fiados_vale'))
  assert.ok(sql.includes('from public, anon, authenticated'))
  assert.ok(sql.includes('grant execute on function public.receber_fiados_vale'))
  assert.ok(sql.includes('to service_role'))
})
