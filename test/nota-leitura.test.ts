// Leitura de nota por foto: normalização, parse de linha e casamento com o catálogo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizaNome, casarProdutos } from '../lib/nota-leitura.ts'
import { classeDoTexto } from '../lib/nota-classes.ts'

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

// O caso real: a nota dizia "13 INCELL JK" e o app escolhia a "11 JK", porque duas
// de três palavras batiam e o número não era exigido. Modelo errado é peça errada:
// melhor devolver vazio (a pessoa escolhe) do que entregar a peça trocada.
test('número do modelo é obrigatório: "13 INCELL JK" não cai na "11 JK"', () => {
  const produtos = [
    { id: 'p11', nome: 'FRONTAL XIAOMI REDMI NOTE 11 INCELL JK COM ARO' },
    { id: 'p13', nome: 'FRONTAL XIAOMI REDMI NOTE 13 INCELL JK COM ARO' },
  ]
  const r = casarProdutos([{ descricao: 'FRONTAL XIAOMI NOTE 13 INCELL JK', quantidade: 1, preco: 90 }], produtos)
  assert.equal(r[0].produto_id, 'p13')
  // sem a peça certa no catálogo, fica SEM produto (nada de chutar a 11)
  const so11 = casarProdutos([{ descricao: 'FRONTAL XIAOMI NOTE 13 INCELL JK', quantidade: 1, preco: 90 }], [produtos[0]])
  assert.equal(so11[0].produto_id, null)
})

test('número não casa por pedaço: "11" não pode cair em "A115"', () => {
  const produtos = [{ id: 'a115', nome: 'GAVETA SAMSUNG A11 5G A115 PRETA' }]
  const r = casarProdutos([{ descricao: 'BATERIA SAMSUNG 11 PRETA', quantidade: 1, preco: 20 }], produtos)
  assert.equal(r[0].produto_id, null)
})

test('classe da nota estreita a escolha: bateria não casa com frontal', () => {
  const produtos = [
    { id: 'f', nome: 'FRONTAL IPHONE 11 INCELL', categoria: 'FRONTAL' },
    { id: 'b', nome: 'BATERIA IPHONE 11 *HK*', categoria: 'BATERIA' },
  ]
  const item = [{ descricao: 'IPHONE 11', quantidade: 1, preco: 50 }]
  // sem classe as duas peças empatam (a escolha vira sorte) — é exatamente o problema
  assert.ok(['f', 'b'].includes(String(casarProdutos(item, produtos)[0].produto_id)))
  // com a classe, cada uma acha a sua
  assert.equal(casarProdutos(item, produtos, 'BATERIA')[0].produto_id, 'b')
  assert.equal(casarProdutos(item, produtos, 'FRONTAL')[0].produto_id, 'f')
  // classe que não existe no catálogo não zera a lista (cai no catálogo inteiro)
  assert.notEqual(casarProdutos(item, produtos, 'ACESSORIO')[0].produto_id, null)
})

test('classeDoTexto entende o que a pessoa escreve na nota', () => {
  assert.equal(classeDoTexto('TELAS E FRONTAIS'), 'FRONTAL')
  assert.equal(classeDoTexto('baterias'), 'BATERIA')
  assert.equal(classeDoTexto('peliculas'), 'PELICULA')
  assert.equal(classeDoTexto('tampas e gavetas'), 'TAMPA')
  assert.equal(classeDoTexto(''), null)
  assert.equal(classeDoTexto(null), null)
})
