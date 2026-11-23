import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumoParticular } from '@/lib/particular'

// A conta da aba Particular do dono: pró-labore − contas particulares pagas = sobra.
// O que estes testes travam é justamente o que não pode escorregar: cancelado fora da
// conta, pendente não abate a sobra e sobra negativa aparece (não vira zero).

const linha = (categoria: string, valor: number, status = 'pendente') => ({ categoria, valor, status })

test('pró-labore previsto soma as duas lojas', () => {
  const r = resumoParticular([
    linha('Pró-labore', 4000, 'pago'),
    linha('Pró-labore', 2000, 'pendente'),
  ])
  assert.equal(r.proLaborePrevisto, 6000)
  assert.equal(r.proLaborePago, 4000)
})

test('sobra = pró-labore − contas particulares PAGAS (pendente não abate)', () => {
  const r = resumoParticular([
    linha('Pró-labore', 6000, 'pago'),
    linha('Particular', 1500, 'pago'),
    linha('Particular', 800, 'pendente'),
  ])
  assert.equal(r.particularPago, 1500)
  assert.equal(r.particularPendente, 800)
  assert.equal(r.sobra, 4500)
})

test('mês sem nada lançado devolve zeros', () => {
  const r = resumoParticular([])
  assert.deepEqual(r, { proLaborePrevisto: 0, proLaborePago: 0, particularPago: 0, particularPendente: 0, sobra: 0 })
})

test('mês com conta particular e nenhum pró-labore deixa a sobra negativa', () => {
  const r = resumoParticular([linha('Particular', 320, 'pago')])
  assert.equal(r.sobra, -320)
})

test('lançamento cancelado não entra em nenhuma conta', () => {
  const r = resumoParticular([
    linha('Pró-labore', 6000, 'pago'),
    linha('Particular', 900, 'cancelado'),
    linha('Particular', 100, 'pago'),
  ])
  assert.equal(r.particularPago, 100)
  assert.equal(r.particularPendente, 0)
  assert.equal(r.sobra, 5900)
})

test('categoria com espaço em volta continua contando', () => {
  const r = resumoParticular([linha(' Particular ', 50, 'pago'), linha(' Pró-labore ', 6000, 'pago')])
  assert.equal(r.particularPago, 50)
  assert.equal(r.proLaborePrevisto, 6000)
})

test('categoria parecida NÃO é pró-labore nem particular', () => {
  const r = resumoParticular([
    linha('Retirada do sócio', 2096.47, 'pago'),
    linha('Salários', 37000, 'pago'),
    linha('Pró-labore', 6000, 'pago'),
  ])
  assert.equal(r.proLaborePrevisto, 6000)
  assert.equal(r.particularPago, 0)
  assert.equal(r.sobra, 6000)
})

test('valor nulo ou inválido não quebra a soma', () => {
  const r = resumoParticular([
    { categoria: 'Pró-labore', valor: null, status: 'pago' },
    { categoria: 'Particular', valor: 200, status: 'pago' },
    { categoria: 'Particular', valor: undefined as unknown as number, status: 'pago' },
  ])
  assert.equal(r.proLaborePrevisto, 0)
  assert.equal(r.particularPago, 200)
  assert.equal(r.sobra, -200)
})

test('centavos não acumulam erro (0,10 + 0,20 + 0,30)', () => {
  const r = resumoParticular([
    linha('Pró-labore', 100, 'pago'),
    linha('Particular', 0.1, 'pago'),
    linha('Particular', 0.2, 'pago'),
    linha('Particular', 0.3, 'pago'),
  ])
  assert.equal(r.particularPago, 0.6)
  assert.equal(r.sobra, 99.4)
})

test('pró-labore pendente conta no previsto (o dinheiro está reservado)', () => {
  const r = resumoParticular([
    linha('Pró-labore', 6000, 'pendente'),
    linha('Particular', 6000, 'pendente'),
  ])
  assert.equal(r.sobra, 6000)
  assert.equal(r.particularPendente, 6000)
})
