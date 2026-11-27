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

// Trava contra a devolução digitada à mão (26/11/2026): no lote de 22/11 nasceram 44
// linhas "Devolução — fulano" sem devolução nenhuma, pagas em PIX — dinheiro saído sem
// compra cancelada, estoque que nunca voltou e cliente que nunca existiu.
test('devolução digitada à mão, sem devolução ligada, é recusada', () => {
  const r = validarEntradaLancamento({ ...base, descricao: 'Devolução — FULANO (estorno de compra)' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.erro, /Devoluç/)
})

test('devolução com devolução ligada passa (linha do fluxo de Devoluções)', () => {
  assert.deepEqual(
    validarEntradaLancamento({ ...base, descricao: 'Devolução — FULANO', devolucaoId: 'abc-123' }),
    { ok: true },
  )
})

test('estorno de crédito à mão também é recusado', () => {
  const r = validarEntradaLancamento({ ...base, descricao: 'Estorno de crédito — devolução da venda #12' })
  assert.equal(r.ok, false)
})

test('despesa comum com a palavra devolução no meio do texto passa', () => {
  // Só o COMEÇO da descrição identifica devolução; "Frete da devolução" é despesa.
  assert.deepEqual(validarEntradaLancamento({ ...base, descricao: 'Frete da devolução — transportadora' }), { ok: true })
  assert.deepEqual(validarEntradaLancamento({ ...base, descricao: 'Desconto concedido — fiado #12' }), { ok: true })
})