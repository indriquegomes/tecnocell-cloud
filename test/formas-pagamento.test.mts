import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node executa TypeScript nativamente neste teste.
import { formaFoiEscolhida } from '../lib/formas-pagamento.ts'

test('forma de quitação vazia exige escolha da atendente', () => {
  assert.equal(formaFoiEscolhida(''), false)
  assert.equal(formaFoiEscolhida('PIX'), true)
})
