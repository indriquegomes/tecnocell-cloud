'use server'

import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { buscarAnunciosDoVendedor, conexaoAtual } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

export async function importarAnuncios() {
  await requirePermissao('integracoes')
  const conexao = await conexaoAtual()
  if (!conexao) return { ok: false, casados: 0, semCorrespondencia: 0, erro: 'Mercado Livre não está conectado.' }

  const supabase = await createServiceClient()
  const [anuncios, produtos] = await Promise.all([
    buscarAnunciosDoVendedor(conexao.ml_user_id),
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
      produto_id: produtoId,
      titulo_ml: a.titulo,
      preco_ml: a.preco,
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
