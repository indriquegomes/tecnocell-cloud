'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { chamarML, buscarDetalhesEmLote } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

export type ActionState = { ok: boolean; message: string } | null

export async function desvincularAnuncio(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermissao('integracoes')
  const anuncioId = fd.get('anuncioId') as string
  const conexaoId = fd.get('conexaoId') as string
  const supabase = await createServiceClient()
  const { error } = await supabase.from('integracoes_mercado_livre_anuncios')
    .update({ produto_id: null, atualizado_em: new Date().toISOString() })
    .eq('id', anuncioId)
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios`)
  return { ok: true, message: 'Desvinculado.' }
}

// Traz de volta título, preço e tipo (catálogo/comum) direto do Mercado
// Livre — pra quando o anúncio mudou lá e o nosso registro ficou desatualizado.
export async function atualizarAnuncioDoML(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermissao('integracoes')
  const anuncioId = fd.get('anuncioId') as string
  const mlItemId = fd.get('mlItemId') as string
  const conexaoId = fd.get('conexaoId') as string
  try {
    const [item] = await buscarDetalhesEmLote(conexaoId, [mlItemId])
    if (!item) return { ok: false, message: 'Anúncio não encontrado no Mercado Livre.' }
    const supabase = await createServiceClient()
    const { error } = await supabase.from('integracoes_mercado_livre_anuncios').update({
      titulo_ml: item.title,
      preco_ml: item.price,
      is_catalogo: item.catalog_listing ?? false,
      catalog_product_id: item.catalog_product_id ?? null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', anuncioId)
    if (error) return { ok: false, message: error.message }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Falha ao buscar anúncio no Mercado Livre.' }
  }
  revalidatePath(`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios`)
  return { ok: true, message: 'Atualizado.' }
}

export async function editarPrecoAnuncio(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requirePermissao('integracoes')
  const anuncioId = fd.get('anuncioId') as string
  const mlItemId = fd.get('mlItemId') as string
  const conexaoId = fd.get('conexaoId') as string
  const novoPreco = Number(fd.get('preco'))
  if (!novoPreco || novoPreco <= 0) return { ok: false, message: 'Preço inválido.' }
  try {
    await chamarML<{ id: string }>(conexaoId, `/items/${mlItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: novoPreco }),
    })
    const supabase = await createServiceClient()
    const { error } = await supabase.from('integracoes_mercado_livre_anuncios').update({
      preco_ml: novoPreco, atualizado_em: new Date().toISOString(),
    }).eq('id', anuncioId)
    // O preço já mudou de verdade no Mercado Livre nesse ponto — falha aqui
    // é só o nosso registro ficando desatualizado, não precisa reverter nada.
    if (error) return { ok: false, message: `Preço mudou no Mercado Livre, mas não deu pra atualizar aqui: ${error.message}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Falha ao mudar preço no Mercado Livre.' }
  }
  revalidatePath(`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios`)
  return { ok: true, message: 'Preço atualizado.' }
}
