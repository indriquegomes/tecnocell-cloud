import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMovimentacaoEstoque } from './sinc.ts'

test('normaliza movimentação de estoque capturada do SIGE', () => {
  const corpo = {
    data: JSON.stringify({
      movements: [{
        produtoID: '693176411d3aeafa069efdc2',
        produtoCodigoNFE: '11507',
        depositoID: '63d9054d59a9c829747233d4',
        tipo: 'Saida',
        quantidade: 1,
        data: '02/09/2026 - 18:36',
        produto: 'FRONTAL XIAOMI',
      }],
      obs: 'troca reginaldo',
    }),
  }

  assert.deepEqual(parseMovimentacaoEstoque(corpo), [{
    produtoIdSige: '693176411d3aeafa069efdc2',
    codigo: '11507',
    depositoId: '63d9054d59a9c829747233d4',
    operacao: 'saida',
    quantidade: 1,
    data: '2026-09-02T21:36:00.000Z',
    produto: 'FRONTAL XIAOMI',
    observacao: 'troca reginaldo',
  }])
})

test('rejeita tipo desconhecido e quantidade inválida', () => {
  assert.equal(parseMovimentacaoEstoque({ data: '{"movements":[{"tipo":"Ajuste","quantidade":1}]}' }), null)
  assert.equal(parseMovimentacaoEstoque({ data: '{"movements":[{"tipo":"Entrada","quantidade":0}]}' }), null)
})
