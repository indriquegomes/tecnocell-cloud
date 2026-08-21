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

  return (data ?? []).map((p) => ({ id: p.id, nome: p.nome, preco: p.preco ?? 0 }))
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
