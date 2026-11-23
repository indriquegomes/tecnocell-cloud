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

// ── Quem não é master não vê o dinheiro do dono ───────────────────────────
// `semODoDono` só monta o filtro; aqui interessa o TEXTO que vai para o PostgREST,
// porque é ele que decide se a linha aparece. Um `or` mal montado vaza o pró-labore
// do dono para o funcionário — e falha silenciosa, sem erro na tela.
import { semODoDono, CATEGORIAS_SO_DO_MASTER } from '@/lib/visibilidade-dono'

const captura = () => {
  const chamadas: string[] = []
  const q = { or: (f: string) => { chamadas.push(f); return q } }
  return { q, chamadas }
}

test('semODoDono esconde as três categorias do dono', () => {
  const { q, chamadas } = captura()
  semODoDono(q, [])
  assert.equal(chamadas.length, 1)
  for (const c of ['Pró-labore', 'Retirada do sócio', 'Particular']) {
    assert.ok(CATEGORIAS_SO_DO_MASTER.includes(c))
    assert.ok(chamadas[0].includes(`"${c}"`), `${c} deveria estar no filtro`)
  }
})

test('semODoDono mantém a linha SEM categoria (nulo não pode sumir)', () => {
  const { q, chamadas } = captura()
  semODoDono(q, [])
  // NOT IN em SQL é nulo quando a coluna é nula: sem esta parte, toda linha sem
  // categoria desaparecia da tela do funcionário.
  assert.ok(chamadas[0].includes('categoria.is.null'))
})

test('semODoDono mantém a linha sem pessoa (quase todo lançamento não tem pessoa)', () => {
  const { q, chamadas } = captura()
  semODoDono(q, ['Indrique Gomes França'])
  assert.ok(chamadas[0].includes('pessoa_nome.is.null'))
  assert.ok(chamadas[0].includes('%Indrique Gomes França%'))
})

test('dois masters exigem E entre os nomes (OU liberaria a linha do outro)', () => {
  const { q, chamadas } = captura()
  semODoDono(q, ['Indrique Gomes França', 'Outro Sócio'])
  assert.ok(chamadas[0].includes('pessoa_nome.not.ilike.%Indrique Gomes França%'))
  assert.ok(chamadas[0].includes('pessoa_nome.not.ilike.%Outro Sócio%'))
  const nomes = chamadas[0].slice(chamadas[0].indexOf('pessoa_nome.is.null'))
  assert.ok(nomes.includes('and('), 'os nomes precisam ficar dentro de um and(...)')
})

