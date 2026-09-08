import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarDescontoItem, criarControleUltimaTroca, distribuirRecebimento, tabelaDoCliente } from './pdv-calculos.ts'

test('item sem edição preserva preço; zero explícito é distinto', () => {
  assert.deepEqual(aplicarDescontoItem(100, 'final', null), { descontoUnitario: 0, precoFinal: 100 })
  assert.deepEqual(aplicarDescontoItem(100, 'final', 0), { descontoUnitario: 100, precoFinal: 0 })
})

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

test('cliente sem tabela volta ao preço padrão', () => {
  const tabelas = [{ id: 'at1' }, { id: 'at2' }]
  assert.equal(tabelaDoCliente('at1', tabelas), 'at1')
  assert.equal(tabelaDoCliente(null, tabelas), '')
  assert.equal(tabelaDoCliente('invisivel', tabelas), '')
})

test('somente última troca de tabela pode aplicar preços', () => {
  const controle = criarControleUltimaTroca()
  const atacado = controle.iniciar()
  const padrao = controle.iniciar()
  assert.equal(controle.vigente(atacado), false)
  assert.equal(controle.vigente(padrao), true)
})
