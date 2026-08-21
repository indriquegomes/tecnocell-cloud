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

export async function buscaProdutos(termo) {
  const t = (termo || '').trim()
  if (!t) return []
  const palavras = semAcento(t).replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
  if (palavras.length === 0) return []

  let q = supabase.from('produtos').select('id, nome, preco').eq('ativo', true).eq('visivel_catalogo', true)
  for (const w of palavras) q = q.ilike('busca_norm', `%${w}%`)
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
  const palavras = semAcento(t).replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
  if (palavras.length === 0) return []

  const orNorm = palavras.map((w) => `busca_norm.ilike.%${w}%`).join(',')
  let { data, error } = await supabase.from('produtos').select('id, nome, preco')
    .eq('ativo', true).eq('visivel_catalogo', true).or(orNorm).limit(60)

  if (error && !(error.code === '42703' || error.message?.includes('busca_norm'))) throw error

  if (error) {
    const orNome = palavras.map((w) => `nome.ilike.%${w}%`).join(',')
    ;({ data, error } = await supabase.from('produtos').select('id, nome, preco')
      .eq('ativo', true).eq('visivel_catalogo', true).or(orNome).limit(60))
    if (error) throw error
  }

  const pontuados = (data ?? [])
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
