import test from 'node:test'
import assert from 'node:assert/strict'
import { diretorioUserData, limpaCliente, pedidoPessoaPDV } from './puxa-clientes.mjs'

test('limpa cadastro SIGE antes de salvar', () => {
  const cliente = {
    Id: 'sige-1',
    CNPJ_CPF: '12.345.678/0001-90',
    NomeFantasia: 'Cliente X',
    Senha: 'segredo',
    Salt: 'segredo',
  }

  assert.deepEqual(pedidoPessoaPDV(cliente), { data: '12345678000190 — Cliente X', arg: null })
  assert.deepEqual(limpaCliente(cliente, 12.5), {
    id: 'sige-1', nome: 'Cliente X', cpfCnpj: '12345678000190', saldoValeCredito: 12.5,
  })
})

test('aceita caminho Profile Path do Chrome', () => {
  assert.equal(diretorioUserData('C:/Chrome/User Data/Default'), 'C:/Chrome/User Data')
  assert.equal(diretorioUserData('C:/Chrome/User Data/Profile 2'), 'C:/Chrome/User Data')
  assert.equal(diretorioUserData('C:/Chrome/User Data'), 'C:/Chrome/User Data')
})
