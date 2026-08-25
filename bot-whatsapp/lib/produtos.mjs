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
const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'sem', 'uma', 'um', 'no', 'na'])
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

function categoriaDe(palavra) {
  if (ABREVIACOES_CURTAS[palavra]) return ABREVIACOES_CURTAS[palavra]
  if (palavra.length < 3) return null
  return CATEGORIAS.find((c) => c.startsWith(palavra) || palavra.startsWith(c)) ?? null
}

function categoriasPedidas(palavras) {
  return [...new Set(palavras.map(categoriaDe).filter(Boolean))]
}

// Sem categoria conhecida na pergunta: não filtra (deixa "16 pro max oled"
// funcionar mesmo sem "oled" no nome — isso é detalhe descritivo, não tipo de
// peça). Com categoria: exige a MESMA categoria nas DUAS PRIMEIRAS palavras do
// nome — não em qualquer lugar do texto. Checar o nome inteiro pega falso
// positivo: "CARCAÇA IPHONE 12 PRO MAX... CÂMERA FRONTAL..." tem a palavra
// "frontal" (descrevendo peça que vem junto), mas o produto não É uma tela, é
// carcaça — confirmado em produção 24/08 que isso passava pelo filtro antigo.
// Só a primeira palavra é curto demais: "CAPAS CASE IPHONE 17 AIR" tem o tipo
// espalhado nas 2 primeiras ("capas" + "case"). No catálogo real o tipo
// sempre está bem no início, então 2 palavras é preciso e continua rápido.
function bateCategoria(nomeSemAcento, categorias) {
  if (categorias.length === 0) return true
  const inicio = nomeSemAcento.split(/\s+/).slice(0, 2).filter(Boolean)
  return categorias.some((cat) => inicio.some((w) => w.startsWith(cat) || cat.startsWith(w)))
}

export async function buscaProdutos(termo) {
  const t = (termo || '').trim()
  if (!t) return []
  const palavras = palavrasBusca(t)
  if (palavras.length === 0) return []

  let q = supabase.from('produtos').select('id, nome, preco').eq('ativo', true).eq('visivel_catalogo', true)
  for (const w of palavras) {
    q = numerica(w) ? q.filter('busca_norm', 'imatch', `\\y${w}\\y`) : q.ilike('busca_norm', `%${w}%`)
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
