// Porteiro do dinheiro — testes da validação do lançamento manual.
// Roda com: node --import ./test/alias.mjs test/validacao-lancamento.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { validarEntradaLancamento, ehCategoriaAceita, categoriasAceitas } from '@/lib/validacao-lancamento'

const formas = ['Dinheiro', 'PIX', 'Débito PagBank', 'Crédito PagBank', 'Vale Crédito', 'Crédito Loja (Fiado)']

const base = {
  categoria: 'Aluguel',
  forma: 'PIX',
  tipo: 'pagar',
  quitado: true,
  contaId: 'conta-1',
  formasValidas: formas,
} as const

test('aceita linha coerente (categoria oficial, forma do cadastro, conta escolhida)', () => {
  assert.deepEqual(validarEntradaLancamento({ ...base }), { ok: true })
})

test('recusa categoria inventada — foi assim que virou despesa a peça que saiu da loja', () => {
  const r = validarEntradaLancamento({ ...base, categoria: 'FONE QUE VITÃO PEGOU NA LOJA' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /não existe na lista|Escolha/)
})

test('recusa lançamento sem categoria', () => {
  const r = validarEntradaLancamento({ ...base, categoria: '' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /categoria/)
})

test('forma "Outros" não vale como pagamento', () => {
  const r = validarEntradaLancamento({ ...base, forma: 'Outros', formasValidas: [...formas, 'Outros'] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /Outros/)
})

test('forma fora do cadastro é recusada', () => {
  const r = validarEntradaLancamento({ ...base, forma: 'recarga de cartão pré-pago' })
  assert.equal(r.ok, false)
})

test('pagamento pago sem conta só passa se for dinheiro (gaveta)', () => {
  const semConta = validarEntradaLancamento({ ...base, contaId: null })
  assert.equal(semConta.ok, false)
  if (!semConta.ok) assert.match(semConta.erro, /conta|gaveta/)

  const naGaveta = validarEntradaLancamento({ ...base, contaId: null, forma: 'Dinheiro' })
  assert.deepEqual(naGaveta, { ok: true })
})

test('lançamento pendente não exige forma de pagamento', () => {
  assert.deepEqual(validarEntradaLancamento({ ...base, quitado: false, forma: '' }), { ok: true })
})

test('edição mantém a grafia antiga da linha (não força reclassificar)', () => {
  assert.deepEqual(
    validarEntradaLancamento({ ...base, categoria: 'motoboy', categoriaAtual: 'motoboy' }),
    { ok: true },
  )
})

test('categoria automática (não oferecida no formulário) é aceita pelo banco', () => {
  assert.equal(ehCategoriaAceita('Estorno de crédito'), true)
  assert.equal(ehCategoriaAceita('Sangria / Retirada'), true)
  assert.equal(ehCategoriaAceita('qualquer coisa'), false)
})

test('lista oficial tem as categorias do dia a dia', () => {
  const lista = categoriasAceitas()
  for (const c of ['Aluguel', 'Mercadoria', 'Salários', 'Particular', 'Pró-labore', 'Vendas', 'Devolução ao cliente']) {
    assert.ok(lista.includes(c), c)
  }
})
