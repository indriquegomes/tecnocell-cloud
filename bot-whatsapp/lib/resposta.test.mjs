import test from 'node:test'
import assert from 'node:assert/strict'
import { montaResposta } from './resposta.mjs'

const LINK = 'https://chat.whatsapp.com/JUTcQgEhrcn7RXFu1kWGMT'

test('um produto, com estoque', () => {
  const txt = montaResposta({
    produtos: [{ id: 'p1', nome: 'Tela iPhone 12', preco: 350 }],
    estoquePorId: new Map([['p1', 3]]),
    comAviso: false,
    linkEncomendas: LINK,
  })
  assert.match(txt, /Tela iPhone 12/)
  assert.match(txt, /R\$\s?350,00/)
  assert.doesNotMatch(txt, /sem estoque/i)
})

test('um produto, sem estoque: oferece encomenda com o link do grupo, sem data', () => {
  const txt = montaResposta({
    produtos: [{ id: 'p1', nome: 'Tela iPhone 12', preco: 350 }],
    estoquePorId: new Map([['p1', 0]]),
    comAviso: false,
    linkEncomendas: LINK,
  })
  assert.match(txt, /sem\b.*\bestoque/i)
  assert.match(txt, /encomenda/i)
  assert.match(txt, new RegExp(LINK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(txt, /\bdia\b|\bpr[oó]xima?\s+(semana|sexta|segunda)\b/i) // não inventa data
})

test('zero produtos', () => {
  const txt = montaResposta({ produtos: [], estoquePorId: new Map(), comAviso: false, linkEncomendas: LINK })
  assert.match(txt, /não encontrei/i)
})

test('um produto, preco zero ou ausente: nao cota, pede confirmacao', () => {
  const txt = montaResposta({
    produtos: [{ id: 'p1', nome: 'Capinha Redmi Note 12', preco: 0 }],
    estoquePorId: new Map([['p1', 5]]),
    comAviso: false,
    linkEncomendas: LINK,
  })
  assert.doesNotMatch(txt, /R\$/)
  assert.match(txt, /confirmar/i)
})

test('mais de um produto: lista numerada, ate 3, sem preco', () => {
  const produtos = [
    { id: 'p1', nome: 'Tela Redmi Note 12', preco: 200 },
    { id: 'p2', nome: 'Tela Redmi Note 12 Pro', preco: 260 },
    { id: 'p3', nome: 'Tela Redmi Note 12S', preco: 220 },
    { id: 'p4', nome: 'Tela Redmi Note 12 5G', preco: 240 },
  ]
  const txt = montaResposta({ produtos, estoquePorId: new Map(), comAviso: false, linkEncomendas: LINK })
  assert.match(txt, /1\. Tela Redmi Note 12\b/)
  assert.match(txt, /2\. Tela Redmi Note 12 Pro/)
  assert.match(txt, /3\. Tela Redmi Note 12S/)
  assert.doesNotMatch(txt, /Tela Redmi Note 12 5G/) // só ate 3
  assert.doesNotMatch(txt, /R\$/) // nunca manda preco quando é ambiguo
  assert.match(txt, /responder só o número/i)
})

test('aviso de assistente automatico só quando comAviso=true', () => {
  const semAviso = montaResposta({ produtos: [], estoquePorId: new Map(), comAviso: false, linkEncomendas: LINK })
  const comAviso = montaResposta({ produtos: [], estoquePorId: new Map(), comAviso: true, linkEncomendas: LINK })
  assert.doesNotMatch(semAviso, /assistente automático/i)
  assert.match(comAviso, /assistente automático/i)
})
