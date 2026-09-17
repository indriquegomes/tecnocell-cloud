import { createClient } from '@supabase/supabase-js'
import { env } from '../../bot/lib/env.mjs'

const supabase = createClient(
  env('NEXT_PUBLIC_SUPABASE_URL'),
  env('SUPABASE_SERVICE_ROLE_KEY'),
)

// Mesma lógica de app/painel/tabelas-preco/actions.ts (buscarProdutosParaTabela):
// tira acento via charCodeAt, ilike em busca_norm por palavra, com fallback pra
// nome/codigo se a coluna não existir (banco sem a migration que a criou).
function semAcento(t) {
  return t.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
}

// Preposição solta ("do", "de"...) bate sem querer dentro de pedaço de outra
// palavra ("do" em "aplicaDOr") e traz produto errado como candidato.
// Confirmado em produção 24/08: "tampa do a30" trouxe aplicador de solda.
// Cortar por TAMANHO da palavra (ex.: descartar tudo < 3 letras) foi tentado
// e quebrou sigla de modelo curta de verdade ("xr" de iPhone XR virou
// "frontal iphone" sozinho e bateu em produto errado) — por isso é lista
// fechada de preposição, não regra de tamanho.
// 'sub' entra aqui porque é qualificador de peça, não nome: "sub placa" no
// catálogo é "placa (conector)". Sem tirar o 'sub', o AND nunca casa.
const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'sem', 'uma', 'um', 'no', 'na', 'sub', 'tem', 'temos', 'quanto', 'custa', 'preco', 'valor', 'valores', 'vcs', 'voce', 'voces'])
function palavrasBusca(t) {
  return semAcento(t).replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean)
    .filter((w) => !CONECTORES.has(w))
    .slice(0, 6)
}

// busca_norm inclui o código interno do produto (ex.: "tampa iphone 8 branca
// 06618 apple") pra permitir busca por SKU nas telas internas. Palavra
// puramente numérica ("8") como pedaço solto bate em qualquer código que
// contenha aquele dígito ("06598") — confirmado em produção 24/08: "tampa 8"
// escondeu as tampas de iPhone 8 de verdade atrás de tampas de Asus/iPhone
// 16 cujo único ponto em comum era o código interno. Número exige palavra
// inteira (`\y...\y`, regex do Postgres) pra só bater em modelo de verdade.
const numerica = (w) => /^\d+$/.test(w)

// Trava fixa, sem IA: se o cliente pede um TIPO de peça conhecido, o produto
// tem que ter essa mesma palavra — senão nunca vira opção, ponto. A checagem
// via IA (nenhumServe em escolheProduto) tentou resolver isso e falhou de
// forma inconsistente em produção 24/08 ("frontal iphone 13 pro max" acertou,
// "frontal s20 fe" e "fro g24" erraram, mesmo já sem "frontal"/"tela" nenhum
// produto de celular do catálogo) — IA varia de pergunta pra pergunta, não dá
// pra confiar só nela pra essa garantia. Lista tirada do catálogo real
// (primeira palavra mais comum: TAMPA, ARO, CARCAÇA, CAPA...). Cliente
// digitando "fro" (abreviação) ainda bate: usa prefixo, não palavra inteira.
const CATEGORIAS = [
  'tampa', 'aro', 'carcaca', 'capa', 'case', 'placa', 'chave', 'pinca', 'espatula',
  'fluxo', 'solda', 'carregador', 'fio', 'multimetro', 'ponta', 'alicate', 'fita',
  'cabo', 'suporte', 'alcool', 'estacao', 'manta', 'malha', 'maquina', 'separadora',
  'ativador', 'pasta', 'estilete', 'fonte', 'organizador', 'soprador', 'esponja',
  'estanho', 'bateria', 'tela', 'frontal', 'display', 'flex', 'conector', 'microfone',
  'camera', 'antena', 'chip', 'vidro', 'pelicula',
]

// Abreviação de 2 letras não entra na regra geral de prefixo — abrir prefixo
// pra tudo >=2 colide: "mi" (Xiaomi Mi) seria prefixo de "microfone" e
// quebraria busca de aparelho Xiaomi de verdade. Só abreviação CONFIRMADA em
// produção entra explícita. "fr" -> frontal: confirmado 24/08 ("fr g20", "fr
// ip 13" passavam sem filtro nenhum com a regra de 3 letras).
const ABREVIACOES_CURTAS = { fr: 'frontal' }

// Sinônimos de TIPO de peça: o cliente fala "tela", o catálogo grava "frontal"
// ou "display" — mesma coisa na loja. Sem isso, "tela do moto g8" não acha
// "FRONTAL MOTOROLA G8" e o bot responde "não encontrei" pra algo que TEM.
const SINONIMOS_TIPO = {
  tela: ['frontal', 'display'],
  frontal: ['tela', 'display'],
  display: ['tela', 'frontal'],
  // marca: "redmi" é a linha da Xiaomi — o catálogo grava "xiaomi" (às vezes os
  // dois). "tampa redmi 8 pro" precisa achar "TAMPA XIAOMI NOTE 8 PRO".
  redmi: ['xiaomi'],
}

function categoriaDe(palavra) {
  if (ABREVIACOES_CURTAS[palavra]) return ABREVIACOES_CURTAS[palavra]
  if (palavra.length < 3) return null
  return CATEGORIAS.find((c) => c.startsWith(palavra) || palavra.startsWith(c)) ?? null
}

function categoriasPedidas(palavras) {
  const cats = new Set()
  for (const p of palavras) {
    const c = categoriaDe(p)
    if (!c) continue
    cats.add(c)
    for (const s of (SINONIMOS_TIPO[c] ?? [])) cats.add(s)
  }
  return [...cats]
}

// Tipos de peça pedidos num termo — exportada pro sessao.mjs carregar o tipo da
// conversa ("frontal iphone 11" → "iphone 12" vira "frontal iphone 12").
export function categoriasDe(termo) {
  return categoriasPedidas(palavrasBusca(termo))
}

// Sem categoria conhecida na pergunta: não filtra. Com categoria: exige o TIPO
// na PRIMEIRA palavra do nome. "CÂMERA FRONTAL" é CÂMERA (frontal é só adjetivo
// "da frente"), não tela — verificar 2 palavras listava câmera como tela.
// "CAPAS" já casa com "capa" via prefixo, então 1 palavra basta pros dois casos.
function bateCategoria(nomeSemAcento, categorias) {
  if (categorias.length === 0) return true
  const primeira = nomeSemAcento.split(/\s+/)[0] || ''
  return categorias.some((cat) => primeira.startsWith(cat) || cat.startsWith(primeira))
}

export async function buscaProdutos(termo) {
  const t = (termo || '').trim()
  if (!t) return []
  const palavras = palavrasBusca(t)
  if (palavras.length === 0) return []

  let q = supabase.from('produtos').select('id, nome, preco').eq('ativo', true).eq('visivel_catalogo', true)
  for (const w of palavras) {
    if (numerica(w)) {
      q = q.filter('busca_norm', 'imatch', `\\y${w}\\y`)
    } else if (SINONIMOS_TIPO[w]) {
      // palavra é um tipo com sinônimo (tela=frontal=display): busca qualquer variante
      q = q.or([w, ...SINONIMOS_TIPO[w]].map((s) => `busca_norm.ilike.%${s}%`).join(','))
    } else {
      q = q.ilike('busca_norm', `%${w}%`)
    }
  }
  let { data, error } = await q.order('nome').limit(5)

  // Erro real (rede, 5xx, chave expirada) não pode virar "[]" em silêncio — o bot
  // diria "não encontrei" sobre um produto que existe. Só a ausência da coluna
  // busca_norm (banco sem a migration) tenta o fallback; qualquer outro erro sobe.
  if (error && !(error.code === '42703' || error.message?.includes('busca_norm'))) throw error

  if (error) {
    let f = supabase.from('produtos').select('id, nome, preco').eq('ativo', true).eq('visivel_catalogo', true)
    for (const w of palavras) f = f.or(`nome.ilike.%${w}%,codigo.ilike.%${w}%`)
    ;({ data, error } = await f.order('nome').limit(5))
    if (error) throw error
  }

  let resultado = data ?? []

  // Desempate: nomes hierárquicos ("IPHONE 11" / "IPHONE 11 PRO" / "IPHONE 11
  // PRO MAX") sempre batem juntos na busca por trecho, porque um nome é
  // substring do outro. Se o cliente digitou o nome EXATO de uma das opções
  // (mesmo conjunto de palavras, nem mais nem menos), isso desempata sem
  // precisar lembrar da conversa anterior — sem isso o bot repete a mesma
  // pergunta ambígua pra sempre, mesmo quando o cliente já respondeu certo.
  if (resultado.length > 1) {
    const alvo = new Set(palavras)
    const exatos = resultado.filter((p) => {
      const palavrasNome = new Set(semAcento(p.nome).split(/\s+/).filter(Boolean))
      return palavrasNome.size === alvo.size && [...alvo].every((w) => palavrasNome.has(w))
    })
    if (exatos.length === 1) resultado = exatos
  }

  const categorias = categoriasPedidas(palavras)
  resultado = resultado.filter((p) => bateCategoria(semAcento(p.nome), categorias))

  return resultado.map((p) => ({ id: p.id, nome: p.nome, preco: p.preco ?? 0 }))
}

// Busca ampla (OR em vez de AND): só entra quando buscaProdutos() volta vazio.
// "16 pro max oled" não bate em nada por AND se o produto no catálogo não tem
// a palavra "oled" no nome — aqui qualquer palavra em comum já traz o produto
// como candidato. Nunca usada como resultado final sozinha — é só uma rede
// maior de candidatos pra IA (escolheProduto, em ia.mjs) escolher; ela é quem
// decide se algum bate de verdade ou se é tudo ruído.
//
// OR puro devolvido em ordem alfabética é ruído demais: palavras curtas como
// "pro"/"max"/"16" aparecem por acaso dentro de nomes sem nenhuma relação
// ("ISOPROPILICO" contém "pro"). Por isso busca um lote maior (60) e reordena
// localmente por quantas palavras da busca aparecem em cada nome — só os
// candidatos mais relevantes (mesma pontuação do melhor) sobem pra IA.
export async function buscaProdutosAmplo(termo) {
  const t = (termo || '').trim()
  if (!t) return []
  const palavras = palavrasBusca(t)
  if (palavras.length === 0) return []

  const orNorm = palavras.map((w) => numerica(w) ? `busca_norm.imatch.\\y${w}\\y` : `busca_norm.ilike.%${w}%`).join(',')
  let { data, error } = await supabase.from('produtos').select('id, nome, preco')
    .eq('ativo', true).eq('visivel_catalogo', true).or(orNorm).limit(60)

  if (error && !(error.code === '42703' || error.message?.includes('busca_norm'))) throw error

  if (error) {
    const orNome = palavras.map((w) => `nome.ilike.%${w}%`).join(',')
    ;({ data, error } = await supabase.from('produtos').select('id, nome, preco')
      .eq('ativo', true).eq('visivel_catalogo', true).or(orNome).limit(60))
    if (error) throw error
  }

  const categorias = categoriasPedidas(palavras)
  const pontuados = (data ?? [])
    .filter((p) => bateCategoria(semAcento(p.nome), categorias))
    .map((p) => ({ produto: { id: p.id, nome: p.nome, preco: p.preco ?? 0 }, acertos: palavras.filter((w) => semAcento(p.nome).includes(w)).length }))
    .filter((x) => x.acertos > 0)
    .sort((a, b) => b.acertos - a.acertos)

  const melhorPontuacao = pontuados[0]?.acertos ?? 0
  return pontuados.filter((x) => x.acertos === melhorPontuacao).slice(0, 8).map((x) => x.produto)
}

export async function buscaEstoque(produtoId, depositoId) {
  const { data, error } = await supabase
    .from('estoque')
    .select('quantidade')
    .eq('produto_id', produtoId)
    .eq('deposito_id', depositoId)
    .maybeSingle()
  if (error) throw error // erro de rede/permissão não pode virar "quantidade: 0" — o bot diria "sem estoque" de um produto que pode estar na prateleira
  return data?.quantidade ?? 0
}

// Chave + titular PIX da loja (conta de nome "PIX" no financeiro).
export async function buscaChavePix() {
  const { data, error } = await supabase.from('contas').select('chave_pix, titular').eq('nome', 'PIX').maybeSingle()
  if (error) throw error
  return data ? { chave: data.chave_pix || null, titular: data.titular || null } : { chave: null, titular: null }
}

// --- Resumo do catálogo pra IA (contexto da loja) ---

// Cache de 1h: o resumo só é refeito de vez em quando. A primeira chamada paga
// a varredura paginada (~10 consultas pra ~9600 itens); as seguintes saem do cache.
let _resumo = ''
let _resumoEm = 0
const RESUMO_TTL_MS = 60 * 60 * 1000

export async function resumoLoja() {
  if (_resumo && Date.now() - _resumoEm < RESUMO_TTL_MS) return _resumo

  const cats = await supabase.from('categorias').select('hierarquia, nome')
  if (cats.error) throw cats.error
  // produtos.categoria guarda a hierarquia (texto), não o id — ex.: "ACESSÓRIOS"
  const nomePorHierarquia = new Map((cats.data ?? []).map((c) => [c.hierarquia, c.nome]))

  const grupos = new Map() // topo da hierarquia -> {n, min, max}
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.from('produtos')
      .select('categoria, preco').eq('ativo', true).eq('visivel_catalogo', true)
      .order('id').range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const p of data) {
      const nome = nomePorHierarquia.get(p.categoria) ?? 'OUTROS'
      const topo = (nome.split('|')[0] || 'OUTROS').trim()
      const g = grupos.get(topo) ?? { n: 0, min: Infinity, max: -Infinity }
      g.n++
      const preco = Number(p.preco) || 0
      if (preco > 0) { // preço 0 = sem preço cadastrado, não entra na faixa
        if (preco < g.min) g.min = preco
        if (preco > g.max) g.max = preco
      }
      grupos.set(topo, g)
    }
    if (data.length < 1000) break
    offset += 1000
  }

  const linhas = [...grupos.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([topo, g]) => `${topo} (${g.n} itens, R$${Math.round(g.min)} a R$${Math.round(g.max)})`)
  _resumo = 'Resumo do catálogo da loja (tipo de item, quantidade e faixa de preço): ' + linhas.join('; ') + '.'
  _resumoEm = Date.now()
  return _resumo
}

// "tem película?" / "tem capa?" / "tem bateria?" — pergunta genérica por TIPO de
// item, sem aparelho/modelo. Não dá pra chutar um produto (o catálogo tem dezenas
// de películas); o certo é perguntar qual aparelho. Detecta quando TODAS as
// palavras relevantes são tipo de peça conhecido (sem marca, modelo ou número).
const FILLER_CONSULTA = new Set(['tem', 'vcs', 'voce', 'voces', 'algum', 'alguma', 'alguns', 'algumas'])

export function ehConsultaGenerica(termo) {
  const palavras = palavrasBusca(termo).filter((w) => !FILLER_CONSULTA.has(w))
  if (palavras.length === 0) return false
  if (categoriasPedidas(palavras).length === 0) return false
  return palavras.every((w) => categoriaDe(w) !== null || SINONIMOS_TIPO[w] || ABREVIACOES_CURTAS[w])
}

// ---- Preço por TABELA do cliente ----
// O WhatsApp manda "5524..." (DDI 55 + DDD + número); o cadastro grava "24 ...",
// "2199...", com/sem hífen. Normaliza e casa pelo número (últimos 9) e pelo número+DDD.

function chavesTelefone(t) {
  let d = String(t || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)  // remove DDI 55
  const chaves = new Set()
  if (d.length >= 9) chaves.add(d.slice(-9))  // só o número
  if (d.length >= 8) chaves.add(d)            // número + DDD
  return [...chaves]
}

let _mapaTelefone = null
let _mapaNome = null
let _mapaEm = 0
const MAPA_TEL_TTL_MS = 5 * 60 * 1000

// Cache de 5 min do mapa telefone -> { tabela_preco_id, nome } (evita varrer as pessoas a cada msg)
async function mapaTelefoneTabela() {
  if (_mapaTelefone && Date.now() - _mapaEm < MAPA_TEL_TTL_MS) return _mapaTelefone
  const mapa = new Map()
  const nomes = new Map()
  let offset = 0
  for (;;) {
    const { data, error } = await supabase.from('pessoas').select('telefone, celular, tabela_preco_id, nome').range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const p of data) {
      const reg = { tabela: p.tabela_preco_id || null, nome: p.nome || null }
      for (const t of [p.telefone, p.celular]) {
        for (const c of chavesTelefone(t)) if (!mapa.has(c)) mapa.set(c, reg)
      }
      const nn = normalizaNome(p.nome)
      if (nn && !nomes.has(nn)) nomes.set(nn, reg)
    }
    if (data.length < 1000) break
    offset += 1000
  }
  _mapaTelefone = mapa
  _mapaNome = nomes
  _mapaEm = Date.now()
  return mapa
}

// Tabela de preço do cliente que mandou a mensagem (null = Preço Padrão/varejo)
export async function buscaTabelaDoCliente(telefone) {
  const chaves = chavesTelefone(telefone)
  if (chaves.length === 0) return { id: null, nome: null, encontrado: false }
  const mapa = await mapaTelefoneTabela()
  for (const c of chaves) {
    const reg = mapa.get(c)
    if (reg) return { id: reg.tabela ?? null, nome: reg.nome ?? null, encontrado: true }
  }
  return { id: null, nome: null, encontrado: false }
}

// Normaliza nome pra comparação: minúsculas, sem acento, pontuação vira espaço.
function normalizaNome(n) {
  return semAcento(n || '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Tabela do cliente pelo NOME (fallback quando o telefone não bate). O nome do
// WhatsApp pode vir com sufixo ("/ acerto fim do dia") ou ser o nome completo do
// cadastro — casa se o nome do WhatsApp CONTÉM o nome completo do cadastro. Só
// casa nome completo (>= 10 letras), nunca primeiro nome solto — evita dar tabela
// errada pra "joão" que é substring de vários cadastros.
export async function buscaTabelaPorNome(nome) {
  if (!nome) return { id: null, nome: null, encontrado: false }
  const alvo = normalizaNome(nome)
  if (!alvo) return { id: null, nome: null, encontrado: false }
  await mapaTelefoneTabela() // garante que _mapaNome foi construído
  if (_mapaNome.has(alvo)) {
    const r = _mapaNome.get(alvo)
    return { id: r.tabela ?? null, nome: r.nome ?? null, encontrado: true }
  }
  let melhor = null
  let melhorKey = ''
  for (const [k, reg] of _mapaNome) {
    if (k.length < 10) continue
    if (alvo.includes(k) && k.length > melhorKey.length) { melhor = reg; melhorKey = k }
  }
  if (melhor) return { id: melhor.tabela ?? null, nome: melhor.nome ?? null, encontrado: true }
  return { id: null, nome: null, encontrado: false }
}

// Id da tabela VAREJO (fallback pra quem não tem cadastro).
export async function buscaTabelaVarejoId() {
  const { data } = await supabase.from('tabelas_preco').select('id').eq('nome', 'VAREJO').maybeSingle()
  return data?.id ?? null
}

// Preço de cada produto na tabela do cliente. Produto sem linha na tabela fica
// com o preço padrão (varejo).
export async function precosDaTabela(tabelaId, produtoIds) {
  const out = new Map()
  if (!tabelaId || !produtoIds || produtoIds.length === 0) return out
  for (let i = 0; i < produtoIds.length; i += 100) {
    const chunk = produtoIds.slice(i, i + 100)
    const { data, error } = await supabase
      .from('itens_tabela_preco')
      .select('produto_id, preco')
      .eq('tabela_id', tabelaId)
      .in('produto_id', chunk)
    if (error) throw error
    for (const it of data ?? []) {
      if (!out.has(it.produto_id)) out.set(it.produto_id, Number(it.preco) || 0)
    }
  }
  return out
}
