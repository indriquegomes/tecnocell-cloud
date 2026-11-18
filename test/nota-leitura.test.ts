// Leitura de nota por foto: normalização, parse de linha e casamento com o catálogo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizaNome, casarProdutos } from '../lib/nota-leitura.ts'

test('normalizaNome tira acento e pontuação', () => {
  assert.equal(normalizaNome('Frontal iPhone 11 VIVID'), 'FRONTAL IPHONE 11 VIVID')
  assert.equal(normalizaNome('FRONTAL IPHONE 8/SE 2020 BRANCA'), 'FRONTAL IPHONE 8 SE 2020 BRANCA')
  assert.equal(normalizaNome(''), '')
})

test('casamento: item da nota acha o produto certo', () => {
  const produtos = [
    { id: 'p1', nome: 'FRONTAL IPHONE 11 LCD PREMIUM VIVID' },
    { id: 'p2', nome: 'FRONTAL IPHONE 11 PRO MAX PREMIUM INCELL JK' },
    { id: 'p3', nome: 'FRONTAL MOTOROLA G04 XT2421/G04S XT2421-1/G24 XT2423 LCD PREMIUM SEM ARO' },
  ]
  const itens = [
    { descricao: 'FRONTAL IPHONE 11 VIVID', quantidade: 5, preco: 47 },
    { descricao: 'FRONTAL MOTOROLA G04 SEM ARO', quantidade: 6, preco: 38 },
  ]
  const r = casarProdutos(itens, produtos)
  assert.equal(r[0].produto_id, 'p1')
  assert.equal(r[0].score, 1)
  assert.equal(r[1].produto_id, 'p3')
})

test('casamento: item sem produto fica sem produto (a pessoa escolhe)', () => {
  const produtos = [{ id: 'p1', nome: 'FRONTAL IPHONE 11 LCD PREMIUM VIVID' }]
  const r = casarProdutos([{ descricao: 'TELA SUPER AMOLED FLEX', quantidade: 1, preco: 10 }], produtos)
  assert.equal(r[0].produto_id, null)
  assert.equal(r[0].produto_nome, null)
  assert.ok(r[0].score < 0.6)
})

test('casamento: nome exato do catálogo sempre casa', () => {
  const produtos = [{ id: 'p1', nome: 'FRONTAL XIAOMI REDMI 13C/POCO C65 LCD PREMIUM COM ARO VIVID' }]
  const r = casarProdutos([{ descricao: 'FRONTAL XIAOMI REDMI 13C COM ARO VIVID', quantidade: 4, preco: 53 }], produtos)
  assert.equal(r[0].produto_id, 'p1')
  assert.equal(r[0].score, 1)
})
