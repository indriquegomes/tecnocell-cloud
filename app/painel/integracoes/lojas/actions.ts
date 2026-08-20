'use server'

import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { buscarAnunciosDoVendedor, buscarConexao } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

// Um catálogo grande ainda pode levar mais que o padrão da Vercel mesmo
// buscando em lote — 60s é o máximo permitido no plano Hobby, então é o teto
// seguro que funciona em qualquer plano sem dar erro de configuração.
export const maxDuration = 60

export async function importarAnuncios(conexaoId: string) {
  await requirePermissao('integracoes')
  const conexao = await buscarConexao(conexaoId)
  if (!conexao) return { ok: false, casados: 0, semCorrespondencia: 0, erro: 'Conexão não encontrada.' }

  const supabase = await createServiceClient()
  const [anuncios, produtos] = await Promise.all([
    buscarAnunciosDoVendedor(conexaoId, conexao.ml_user_id),
    fetchAll<{ id: string; codigo: string | null }>((de, ate) =>
      supabase.from('produtos').select('id, codigo').range(de, ate)),
  ])

  const produtoIdPorCodigo = new Map(
    produtos.filter((p) => p.codigo).map((p) => [String(p.codigo).trim(), p.id])
  )

  let casados = 0
  let semCorrespondencia = 0
  const linhas = anuncios.map((a) => {
    const produtoId = a.sku ? produtoIdPorCodigo.get(a.sku.trim()) ?? null : null
    if (produtoId) casados++
    else semCorrespondencia++
    return {
      ml_item_id: a.ml_item_id,
      conexao_id: conexaoId,
      produto_id: produtoId,
      titulo_ml: a.titulo,
      preco_ml: a.preco,
      is_catalogo: a.catalogo,
      catalog_product_id: a.catalogProductId,
      atualizado_em: new Date().toISOString(),
    }
  })

  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase
      .from('integracoes_mercado_livre_anuncios')
      .upsert(linhas.slice(i, i + 500), { onConflict: 'ml_item_id' })
    if (error) return { ok: false, casados, semCorrespondencia, erro: error.message }
  }

  revalidatePath('/painel/integracoes/lojas')
  return { ok: true, casados, semCorrespondencia }
}

export async function desconectarMercadoLivre(conexaoId: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('integracoes')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('integracoes_mercado_livre').delete().eq('id', conexaoId)
  if (error) return { ok: false, erro: error.message }
  revalidatePath('/painel/integracoes')
  revalidatePath('/painel/integracoes/lojas')
  return { ok: true }
}
