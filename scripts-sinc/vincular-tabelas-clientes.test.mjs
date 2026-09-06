import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarTabela, idPessoa, normalizarNome } from './vincular-tabelas-clientes.mjs'

test('mapeia apenas tabelas de venda físicas', () => {
  assert.equal(normalizarTabela('ATACADO1'), 'ATACADO1')
  assert.equal(normalizarTabela(' atacado2 '), 'ATACADO2')
  assert.equal(normalizarTabela('VAREJO'), null)
  assert.equal(normalizarTabela('ESTOQUE GERAL'), null)
})

test('normaliza nome apenas para fallback inequívoco', () => {
  assert.equal(normalizarNome(' João  da-Silva '), 'JOAO DA SILVA')
})

test('extrai ObjectId do identificador SIGE sem alterar zeros', () => {
  assert.equal(idPessoa('64cd5d1d4475ce425bcaa942idpessoa'), '64cd5d1d4475ce425bcaa942')
  assert.equal(idPessoa('---'), null)
})
