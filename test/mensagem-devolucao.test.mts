import assert from 'node:assert/strict'
import test from 'node:test'
import { mensagemDevolucao, whatsappDevolucao } from '../lib/mensagem-devolucao.ts'

const base = {
  cliente: 'ISABELA',
  valor: 147,
  numero: 935,
  produtos: [
    { nome: 'FRONTAL A', quantidade: 2 },
    { nome: 'FLEX B', quantidade: 1 },
  ],
}

test('monta mensagem de vale-crédito com todos os produtos', () => {
  assert.equal(mensagemDevolucao({ ...base, tipo: 'credito_conta' }), `Olá, ISABELA! 😊

Geramos vale-crédito de R$ 147,00, referente aos produtos FRONTAL A (2x) e FLEX B da venda nº 935.

Crédito disponível para próxima compra.

#TecnocellBrasil`)
})

test('monta mensagem de cancelamento de fiado', () => {
  assert.equal(mensagemDevolucao({ ...base, tipo: 'cancelamento_fiado' }), `Olá, ISABELA! 😊

Registramos devolução dos produtos FRONTAL A (2x) e FLEX B da venda nº 935.

Dívida de R$ 147,00 foi cancelada. Saldo atualizado.

#TecnocellBrasil`)
})

test('não cria mensagem para outro reembolso', () => {
  assert.equal(mensagemDevolucao({ ...base, tipo: 'pix' }), null)
})

test('cria WhatsApp apenas para telefone válido', () => {
  const mensagem = 'Teste'
  assert.equal(whatsappDevolucao('(24) 99999-9999', mensagem), `https://wa.me/5524999999999?text=${encodeURIComponent(mensagem)}`)
  assert.equal(whatsappDevolucao('123', mensagem), null)
  assert.equal(whatsappDevolucao(null, mensagem), null)
})
