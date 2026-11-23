import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setorDaCategoria, TODAS_CATEGORIAS, ehCompraDeMercadoria, subcategoriasDe } from '@/lib/financeiro-setores'

// A régua do Financeiro: cada categoria pertence a UM setor (o filtro em cascata e o
// formulário leem daqui). Estes testes travam (a) as categorias que nasceram na rodada
// de 22/11, (b) as grafias legadas que continuam precisando cair no setor certo e
// (c) a regra de que mercadoria não é despesa.

test('Jurídico e Tarifas bancárias são estrutura da loja', () => {
  assert.equal(setorDaCategoria('Jurídico').chave, 'estrutura')
  assert.equal(setorDaCategoria('Tarifas bancárias').chave, 'estrutura')
})

test('Pró-labore e Retirada do sócio ficam no setor do sócio', () => {
  assert.equal(setorDaCategoria('Pró-labore').chave, 'socio')
  assert.equal(setorDaCategoria('Retirada do sócio').chave, 'socio')
})

test('Particular tem setor próprio', () => {
  assert.equal(setorDaCategoria('Particular').chave, 'particular')
})

test('Perda de troca é operação (não confundir com Perda de caixa)', () => {
  assert.equal(setorDaCategoria('Perda de troca').chave, 'operacao')
  assert.equal(setorDaCategoria('Perda').chave, 'operacao')
})

test('grafias antigas de mercadoria caem em Fornecedores, não em "Sem categoria"', () => {
  assert.equal(setorDaCategoria('Mercadoria').chave, 'fornecedores')
  assert.equal(setorDaCategoria('Fornecedor / Mercadoria').chave, 'fornecedores')
  assert.equal(setorDaCategoria('fornecedor/mercadoria').chave, 'fornecedores')
})

test('categoria vazia ou desconhecida cai em "Sem categoria"', () => {
  assert.equal(setorDaCategoria(null).chave, 'sem_categoria')
  assert.equal(setorDaCategoria('').chave, 'sem_categoria')
  assert.equal(setorDaCategoria('Categoria Que Ninguém Criou').chave, 'sem_categoria')
})

test('a comparação de setor não liga para maiúscula/minúscula', () => {
  assert.equal(setorDaCategoria('aluguel').chave, 'estrutura')
  assert.equal(setorDaCategoria('PARTICULAR').chave, 'particular')
})

test('a sugestão do formulário NÃO oferece as grafias legadas', () => {
  assert.ok(TODAS_CATEGORIAS.includes('Mercadoria'))
  assert.ok(!TODAS_CATEGORIAS.includes('Fornecedor / Mercadoria'))
  assert.ok(!TODAS_CATEGORIAS.includes('fornecedor/mercadoria'))
  assert.ok(!TODAS_CATEGORIAS.includes('Vale Transporte'))
})

test('a sugestão do formulário traz as categorias novas', () => {
  for (const c of ['Jurídico', 'Tarifas bancárias', 'Particular', 'Pró-labore', 'Perda de troca']) {
    assert.ok(TODAS_CATEGORIAS.includes(c), `${c} deveria estar na sugestão`)
  }
})

test('mercadoria não é despesa — com ou sem espaço na barra', () => {
  assert.equal(ehCompraDeMercadoria('Mercadoria'), true)
  assert.equal(ehCompraDeMercadoria('Fornecedor / Mercadoria'), true)
  assert.equal(ehCompraDeMercadoria('fornecedor/mercadoria'), true)
  assert.equal(ehCompraDeMercadoria('Fornecedor/Mercadoria'), true)
  assert.equal(ehCompraDeMercadoria('Aluguel'), false)
  assert.equal(ehCompraDeMercadoria(null), false)
})

test('Particular tem subcategorias de vida, não de loja', () => {
  const subs = subcategoriasDe('Particular')
  assert.ok(subs.includes('Casa'))
  assert.ok(subs.includes('Escola'))
  assert.ok(!subs.includes('Loja'))
})
