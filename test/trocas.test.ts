// Testes da regra PURA de perda na troca com fornecedor (lib/trocas-regras.ts).
// Roda com: node --import ./test/alias.mjs test/trocas.test.ts
//
// O que se prova aqui: o fornecedor pode mandar peça equivalente um pouco mais
// barata sem virar "perda do mês" — mas acima da tolerância a perda tem que ser
// registrada com o valor exato. Tolerância padrão da loja: R$ 100.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirPerdaRetorno } from '@/lib/trocas-regras'

const TOL = 100
const base = { custoOriginal: 250, quantidade: 1, tolerancia: TOL, ehSubstituta: true }

test('voltou a MESMA peça: nunca há perda nem observação', () => {
  const r = decidirPerdaRetorno({ ...base, custoRetorno: 250, ehSubstituta: false })
  assert.equal(r.perda, 0)
  assert.equal(r.observacao, null)
})

test('mesma peça com custo de cadastro diferente NÃO vira perda (custo congelado)', () => {
  const r = decidirPerdaRetorno({ ...base, custoRetorno: 180, ehSubstituta: false })
  assert.equal(r.perda, 0)
  assert.equal(r.diferenca, 0)
})

test('substituta R$ 30 mais barata (dentro dos R$ 100): sem perda, com observação', () => {
  const r = decidirPerdaRetorno({ ...base, custoRetorno: 220 })
  assert.equal(r.perda, 0)
  assert.equal(r.diferenca, 30)
  assert.match(r.observacao ?? '', /dentro da tolerância/)
})

test('diferença EXATAMENTE igual à tolerância ainda não é perda', () => {
  const r = decidirPerdaRetorno({ ...base, custoRetorno: 150 })
  assert.equal(r.diferenca, 100)
  assert.equal(r.perda, 0)
})

test('um centavo acima da tolerância JÁ é perda', () => {
  const r = decidirPerdaRetorno({ ...base, custoRetorno: 149.99 })
  assert.equal(r.diferenca, 100.01)
  assert.equal(r.perda, 100.01)
  assert.match(r.observacao ?? '', /acima da tolerância/)
})

test('substituta muito mais barata: perda do valor cheio da diferença', () => {
  const r = decidirPerdaRetorno({ ...base, custoRetorno: 100 })
  assert.equal(r.perda, 150)
})

test('substituta mais CARA: não vira perda nem receita', () => {
  const r = decidirPerdaRetorno({ ...base, custoRetorno: 300 })
  assert.equal(r.perda, 0)
  assert.match(r.observacao ?? '', /mais cara/)
})

test('quantidade 3 multiplica a diferença', () => {
  const r = decidirPerdaRetorno({ ...base, custoOriginal: 250, custoRetorno: 200, quantidade: 3 })
  assert.equal(r.diferenca, 150)   // (250-200)*3
  assert.equal(r.perda, 150)       // acima de 100
})

test('quantidade 3 dentro da tolerância: sem perda', () => {
  const r = decidirPerdaRetorno({ ...base, custoOriginal: 250, custoRetorno: 230, quantidade: 3 })
  assert.equal(r.diferenca, 60)
  assert.equal(r.perda, 0)
})

test('tolerância ZERO: qualquer diferença vira perda', () => {
  const r = decidirPerdaRetorno({ ...base, tolerancia: 0, custoRetorno: 249.99 })
  assert.equal(r.perda, 0.01)
})

test('tolerância inválida (NaN ou negativa) é tratada como zero — não deixa passar perda', () => {
  for (const t of [NaN, -50, undefined as unknown as number]) {
    const r = decidirPerdaRetorno({ ...base, tolerancia: t, custoRetorno: 200 })
    assert.equal(r.perda, 50, `tolerância ${t} deveria virar 0`)
  }
})

test('custo inválido não quebra a conta', () => {
  const r = decidirPerdaRetorno({ ...base, custoOriginal: NaN, custoRetorno: NaN, quantidade: NaN })
  assert.equal(r.perda, 0)
})

test('quantidade zero ou negativa é tratada como 1', () => {
  const r = decidirPerdaRetorno({ ...base, custoRetorno: 100, quantidade: 0 })
  assert.equal(r.diferenca, 150)
})

test('fração de centavo não inventa perda', () => {
  // 250,005 - 250 em ponto flutuante dá 0,004999... — tem que virar 0 ou 0,01,
  // nunca uma perda. O que importa: com R$ 100 de tolerância, perda = 0.
  const r = decidirPerdaRetorno({ ...base, custoOriginal: 250.005, custoRetorno: 250 })
  assert.ok(r.diferenca <= 0.01, `diferença veio ${r.diferenca}`)
  assert.equal(r.perda, 0)
})
