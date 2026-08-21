import test from 'node:test'
import assert from 'node:assert/strict'
import { guardaPendente, pegaPendente, limpaPendente } from './estado.mjs'

test('guarda e recupera pendente', () => {
  const produtos = [{ id: 'p1', nome: 'X', preco: 10 }]
  guardaPendente('petropolis', 'jid1', produtos)
  assert.deepEqual(pegaPendente('petropolis', 'jid1'), produtos)
})

test('nao mistura loja/jid diferentes', () => {
  guardaPendente('petropolis', 'jidA', [{ id: 'a' }])
  assert.equal(pegaPendente('teresopolis', 'jidA'), null)
  assert.equal(pegaPendente('petropolis', 'jidB'), null)
})

test('limpaPendente remove', () => {
  guardaPendente('petropolis', 'jidC', [{ id: 'c' }])
  limpaPendente('petropolis', 'jidC')
  assert.equal(pegaPendente('petropolis', 'jidC'), null)
})

test('sem pendente devolve null', () => {
  assert.equal(pegaPendente('petropolis', 'jid-inexistente'), null)
})
