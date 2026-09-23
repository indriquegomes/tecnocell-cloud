import assert from 'node:assert/strict'
import test from 'node:test'
import { mensagemPagamentoCrediario } from '../lib/mensagem-crediario.ts'

test('monta mensagem de pagamento com várias notas', () => {
  assert.equal(mensagemPagamentoCrediario({
    cliente: 'HIPERCELL',
    valor: 484,
    forma: 'Dinheiro',
    notas: ['5879', '5880', '5881'],
    saldoRestante: 770,
  }), `Olá, HIPERCELL! 🧡

Seu pagamento de R$ 484,00 foi recebido em DINHEIRO e abatido nas notas 5879, 5880, 5881.

Saldo restante atualizado: R$ 770,00.`)
})

test('monta mensagem de pagamento com uma nota só', () => {
  assert.equal(mensagemPagamentoCrediario({
    cliente: 'ISABELA',
    valor: 100,
    forma: 'Pix',
    notas: ['5879'],
    saldoRestante: 0,
  }), `Olá, ISABELA! 🧡

Seu pagamento de R$ 100,00 foi recebido em PIX e abatido na nota 5879.

Saldo restante atualizado: R$ 0,00.`)
})

test('não quebra sem número de nota', () => {
  assert.equal(mensagemPagamentoCrediario({
    cliente: 'CLIENTE',
    valor: 50,
    forma: 'Cartão',
    notas: [null],
    saldoRestante: 0,
  }), `Olá, CLIENTE! 🧡

Seu pagamento de R$ 50,00 foi recebido em CARTÃO e abatido.

Saldo restante atualizado: R$ 0,00.`)
})
