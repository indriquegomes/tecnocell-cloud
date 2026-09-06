import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarDescontoItem, distribuirRecebimento } from './pdv-calculos.ts'

test('desconto unitario calcula preco final sem duplicar promocao', () => {
  assert.deepEqual(aplicarDescontoItem(100, 'percent', 10), { descontoUnitario: 10, precoFinal: 90 })
  assert.deepEqual(aplicarDescontoItem(100, 'valor', 15), { descontoUnitario: 15, precoFinal: 85 })
  assert.deepEqual(aplicarDescontoItem(100, 'final', 72.5), { descontoUnitario: 27.5, precoFinal: 72.5 })
})

test('desconto unitario fica entre zero e preco base', () => {
  assert.deepEqual(aplicarDescontoItem(100, 'percent', 150), { descontoUnitario: 100, precoFinal: 0 })
  assert.deepEqual(aplicarDescontoItem(100, 'final', 120), { descontoUnitario: 0, precoFinal: 100 })
})

test('recebimento total distribui das dividas antigas para novas', () => {
  const itens = [
    { id: 'nova', restante: 30, vencimento: '2026-09-03' },
    { id: 'antiga', restante: 50, vencimento: '2026-08-01' },
    { id: 'meio', restante: 40, vencimento: '2026-08-15' },
  ]
  assert.deepEqual(distribuirRecebimento(itens, 75), { antiga: 50, meio: 25, nova: 0 })
})

test('recebimento nunca passa do saldo total', () => {
  assert.deepEqual(distribuirRecebimento([{ id: 'a', restante: 20, vencimento: null }], 99), { a: 20 })
})
