import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosDeFechamento, precisaCiencia } from '../lib/avisos-caixa.ts'

// A loja troca de funcionário no meio do dia e fecha o caixa mais de uma vez.
// Estes avisos existem para o dinheiro não se perder nessa troca.

const base = { abertoEm: '2026-11-03T11:00:00-03:00', agora: '2026-11-03T18:00:00-03:00' }

test('fechamento limpo não gera aviso nenhum', () => {
  assert.deepEqual(avisosDeFechamento({ ...base, divergencia: 0, pixFornecedorSemBaixa: { total: 0, comprovantes: 0 } }), [])
  assert.equal(precisaCiencia([]), false)
})

test('Pix de fornecedor sem baixa é o aviso mais duro e pede ciência', () => {
  const a = avisosDeFechamento({ ...base, pixFornecedorSemBaixa: { total: 5000, comprovantes: 12 } })
  assert.equal(a.length, 1)
  assert.equal(a[0].nivel, 'conferir')
  assert.match(a[0].titulo, /12 comprovantes/)
  assert.match(a[0].titulo, /5\.000,00/)
  assert.equal(precisaCiencia(a), true)
})

test('falta e sobra na contagem avisam com o valor e o lado certo', () => {
  const falta = avisosDeFechamento({ ...base, divergencia: -37.5 })
  assert.match(falta[0].titulo, /^Falta de 37,50/)
  const sobra = avisosDeFechamento({ ...base, divergencia: 12 })
  assert.match(sobra[0].titulo, /^Sobra de 12,00/)
  assert.equal(precisaCiencia(falta), true)
})

test('o valor da diferença aparece por padrão (pedido do dono: ajuda achar o erro)', () => {
  // Mostrar "falta 37,50" na contagem é o default: é o que aponta onde procurar.
  const a = avisosDeFechamento({ ...base, divergencia: -37.5 })
  assert.match(a[0].titulo, /37/)
  // a opção existe para telas onde revelar o esperado não deve acontecer
  const sem = avisosDeFechamento({ ...base, divergencia: -37.5, divergenciaComValor: false })
  assert.doesNotMatch(sem[0].titulo, /37/)
  assert.match(sem[0].titulo, /não confere/)
})

test('centavo de arredondamento não vira aviso', () => {
  assert.deepEqual(avisosDeFechamento({ ...base, divergencia: 0.004 }), [])
})

test('caixa aberto ontem avisa que a venda de dois dias está na mesma sessão', () => {
  const a = avisosDeFechamento({ ...base, abertoEm: '2026-11-02T11:00:00-03:00' })
  assert.equal(a.length, 1)
  assert.equal(a[0].nivel, 'info')
  assert.match(a[0].titulo, /02\/11\/2026/)
  assert.equal(precisaCiencia(a), false)   // informa, não trava
})

test('caixa aberto 23h e fechado 00h30 do dia seguinte é sessão de dois dias', () => {
  // 23h de 02/11 em São Paulo = 02:00 UTC de 03/11 — a comparação tem que ser em
  // horário de São Paulo, senão o aviso aparece (ou some) errado.
  const a = avisosDeFechamento({ abertoEm: '2026-11-02T23:00:00-03:00', agora: '2026-11-03T00:30:00-03:00' })
  assert.equal(a.length, 1)
  assert.match(a[0].titulo, /02\/11\/2026/)
})

test('PIX do sistema sem comprovante no grupo pede ciência', () => {
  const a = avisosDeFechamento({ ...base, pixSemComprovante: 2 })
  assert.equal(a[0].nivel, 'conferir')
  assert.equal(precisaCiencia(a), true)
})

test('reforço sem motivo só informa', () => {
  const a = avisosDeFechamento({ ...base, movimentosSemMotivo: 1 })
  assert.equal(a[0].nivel, 'info')
  assert.match(a[0].titulo, /1 reforço\/retirada sem motivo/)
})

test('sessão aberta com valor diferente do troco fixo avisa o excedente', () => {
  const a = avisosDeFechamento({ ...base, valorAbertura: 10200, trocoPadrao: 200 })
  assert.equal(a[0].nivel, 'info')
  assert.match(a[0].titulo, /10\.200,00/)
  assert.match(a[0].titulo, /200,00/)
  // troco padrão não cadastrado (0) não gera aviso
  assert.deepEqual(avisosDeFechamento({ ...base, valorAbertura: 500, trocoPadrao: 0 }), [])
})

test('gaveta com menos dinheiro que a abertura avisa que saiu cédula sem registro', () => {
  const a = avisosDeFechamento({ ...base, valorAbertura: 10200, saldoGaveta: 300 })
  assert.equal(a[0].nivel, 'conferir')
  assert.match(a[0].titulo, /9\.900,00 a menos/)
  assert.equal(precisaCiencia(a), true)
  // gaveta igual ou maior que a abertura não gera esse aviso
  assert.deepEqual(avisosDeFechamento({ ...base, valorAbertura: 200, saldoGaveta: 200 }), [])
})

test('vários problemas juntos aparecem todos, e um só conferir já exige ciência', () => {
  const a = avisosDeFechamento({
    ...base,
    divergencia: -10,
    pixFornecedorSemBaixa: { total: 300, comprovantes: 2 },
    pixSemComprovante: 1,
    movimentosSemMotivo: 2,
    valorAbertura: 1000,
    trocoPadrao: 200,
  })
  assert.equal(a.length, 5)
  assert.equal(precisaCiencia(a), true)
})
