// Testes do ESTORNO do abatimento na nota (lib/estorno-abatimento.ts).
// Roda com: node --import ./test/alias.mjs test/estorno.test.ts
//
// O que se prova: "Desfazer pagamento" devolve para a nota do fornecedor exatamente o
// que aquele pagamento encolheu — nem mais (abatimento de outra baixa) nem menos — e
// uma nota que tinha zerado volta a ser cobrável.
import test from 'node:test'
import assert from 'node:assert/strict'
import { planejarEstornoNota } from '@/lib/estorno-abatimento'

const meu = 'pgto-1'
const outro = 'pgto-2'

test('devolve o valor e tira a linha do histórico', () => {
  const r = planejarEstornoNota({
    valor: 7000,
    descricao: 'COMPRA MERCADORIA - NOTA 118 (abateu 4445,19 de pagamento)',
    historico: [{ valor: 4445.19, forma: 'pagamento', data: '2026-11-17T10:00:00Z', lancamento_id: meu }],
    lancamentoId: meu,
  })
  assert.ok(r)
  assert.equal(r.abatido, 4445.19)
  assert.equal(r.novoValor, 11445.19)
  assert.equal(r.novoStatus, 'pendente')
  assert.equal(r.novoHistorico.length, 0)
})

test('só mexe no que é DESTA baixa — abatimento de outro pagamento fica', () => {
  const r = planejarEstornoNota({
    valor: 1000,
    descricao: 'NOTA 9 (abateu 200,00 de pagamento) (abateu 300,00 de pagamento)',
    historico: [
      { valor: 200, forma: 'pagamento', lancamento_id: meu },
      { valor: 300, forma: 'pagamento', lancamento_id: outro },
    ],
    lancamentoId: meu,
  })
  assert.ok(r)
  assert.equal(r.abatido, 200)
  assert.equal(r.novoValor, 1200)
  assert.equal(r.novoHistorico.length, 1)
  assert.equal(r.novoHistorico[0].valor, 300)
  // a descrição perde só o pedaço de 200,00
  assert.equal(r.novaDescricao, 'NOTA 9 (abateu 300,00 de pagamento)')
})

test('nota que tinha zerado (cancelada) volta a ser cobrável com o valor devolvido', () => {
  const r = planejarEstornoNota({
    valor: 0,
    descricao: 'NOTA 110 (abateu 2496,00 de pagamento)',
    historico: [{ valor: 2496, forma: 'pagamento', lancamento_id: meu }],
    lancamentoId: meu,
  })
  assert.ok(r)
  assert.equal(r.novoValor, 2496)
  assert.equal(r.novoStatus, 'pendente')
  assert.equal(r.novaDescricao, 'NOTA 110')
})

test('mais de uma linha da MESMA baixa na mesma nota soma tudo', () => {
  const r = planejarEstornoNota({
    valor: 100,
    descricao: 'NOTA 5',
    historico: [
      { valor: 50, forma: 'pagamento', lancamento_id: meu },
      { valor: 25.5, forma: 'pagamento', lancamento_id: meu },
    ],
    lancamentoId: meu,
  })
  assert.ok(r)
  assert.equal(r.abatido, 75.5)
  assert.equal(r.novoValor, 175.5)
})

test('abatimento antigo, sem carimbo do lançamento, NÃO é estornado (null)', () => {
  const r = planejarEstornoNota({
    valor: 100,
    descricao: 'NOTA 5 (abateu 50,00 de pagamento)',
    historico: [{ valor: 50, forma: 'pagamento', data: '2026-11-01T10:00:00Z' }],
    lancamentoId: meu,
  })
  assert.equal(r, null)
})

test('histórico vazio ou inválido devolve null (não inventa valor)', () => {
  assert.equal(planejarEstornoNota({ valor: 100, descricao: 'X', historico: null, lancamentoId: meu }), null)
  assert.equal(planejarEstornoNota({ valor: 100, descricao: 'X', historico: [], lancamentoId: meu }), null)
  assert.equal(planejarEstornoNota({ valor: 100, descricao: 'X', historico: 'lixo', lancamentoId: meu }), null)
})

test('sem id do lançamento não faz nada', () => {
  const r = planejarEstornoNota({
    valor: 100, descricao: 'X',
    historico: [{ valor: 10, forma: 'pagamento', lancamento_id: '' }],
    lancamentoId: '   ',
  })
  assert.equal(r, null)
})

test('descrição sem o pedaço escrito: valor volta igual, descrição não quebra', () => {
  const r = planejarEstornoNota({
    valor: 500,
    descricao: 'COMPRA MERCADORIA - NOTA 42',
    historico: [{ valor: 100, forma: 'pagamento', lancamento_id: meu }],
    lancamentoId: meu,
  })
  assert.ok(r)
  assert.equal(r.novoValor, 600)
  assert.equal(r.novaDescricao, 'COMPRA MERCADORIA - NOTA 42')
})

test('centavo de arredondamento não sobra nem falta', () => {
  const r = planejarEstornoNota({
    valor: 0.1,
    descricao: 'X (abateu 0,20 de pagamento)',
    historico: [{ valor: 0.2, forma: 'pagamento', lancamento_id: meu }],
    lancamentoId: meu,
  })
  assert.ok(r)
  assert.equal(r.novoValor, 0.3)
})
