import assert from 'node:assert/strict'
import test from 'node:test'
import { formaFoiEscolhida, labelTipoPagamento } from '../lib/formas-pagamento.ts'

test('forma de quitação vazia exige escolha da atendente', () => {
  assert.equal(formaFoiEscolhida(''), false)
  assert.equal(formaFoiEscolhida('PIX'), true)
})

test('fiado aparece como Crédito Loja (A Receber)', () => {
  assert.equal(labelTipoPagamento('fiado'), 'Crédito Loja (A Receber)')
})
