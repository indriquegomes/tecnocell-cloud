import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node executa TypeScript nativamente neste teste.
import { incluiTexto } from '../lib/texto-busca.ts'

test('busca ignora produto sem nome', () => {
  assert.equal(incluiTexto(null, 'flex'), false)
})
