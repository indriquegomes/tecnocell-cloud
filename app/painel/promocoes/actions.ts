'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Busca de catálogo SOB DEMANDA pro painel "adicionar em lote" (não embutir os
// 7.983 no HTML). Retorna TODOS os matches do termo (pro "selecionar todos"),
// até 800. Sem acento via busca_norm; fallback por nome/código/marca.
export async function buscarCatalogoPromo(
  accessToken: string,
  termo: string,
): Promise<{ id: string; nome: string; codigo: string | null; marca: string | null; preco: number; preco_custo: number }[]> {
  await requirePermissao('produtos', accessToken)
  const t = termo.trim()
  if (t.length < 1) return []
  const supabase = await createServiceClient()
  const semAcento = t.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
  const palavras = semAcento.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
  if (palavras.length === 0) return []
  let q = supabase.from('produtos').select('id, nome, codigo, marca, preco, preco_custo').eq('ativo', true)
  for (const w of palavras) q = q.ilike('busca_norm', `%${w}%`)
  let { data, error } = await q.order('nome').limit(800)
  if (error && (error.code === '42703' || error.message?.includes('busca_norm'))) {
    let f = supabase.from('produtos').select('id, nome, codigo, marca, preco, preco_custo').eq('ativo', true)
    for (const w of palavras) f = f.or(`nome.ilike.%${w}%,codigo.ilike.%${w}%,marca.ilike.%${w}%`)
    ;({ data } = await f.order('nome').limit(800))
  }
  return (data ?? []).map((p) => ({ id: p.id, nome: p.nome, codigo: p.codigo, marca: p.marca, preco: p.preco ?? 0, preco_custo: (p as { preco_custo: number | null }).preco_custo ?? 0 }))
}

export async function criarPromocao(formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const tipo = formData.get('tipo') as string
  const qx = formData.get('quantidade_x')
  const qy = formData.get('quantidade_y')

  const { data, error } = await supabase.from('promocoes').insert({
    nome: formData.get('nome') as string,
    tipo,
    valor: parseFloat(formData.get('valor') as string) || 0,
    data_inicio: formData.get('data_inicio') as string || null,
    data_fim: formData.get('data_fim') as string || null,
    descricao: formData.get('descricao') as string || null,
    ativa: true,
    quantidade_x: qx ? parseInt(qx as string) || null : null,
    quantidade_y: qy ? parseInt(qy as string) || null : null,
  }).select('id').single()

  if (error) redirect(`/painel/promocoes?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/promocoes')
  redirect(`/painel/promocoes/${data!.id}`)
}

// ===== Faixas de quantidade (promoção "progressivo") =====
export async function adicionarFaixa(promocaoId: string, quantidadeMinima: number, preco: number) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  // substitui se já existir uma faixa com essa quantidade
  await supabase.from('faixas_promocao').delete().eq('promocao_id', promocaoId).eq('quantidade_minima', quantidadeMinima)
  const { error } = await supabase.from('faixas_promocao').insert({ promocao_id: promocaoId, quantidade_minima: quantidadeMinima, preco })
  if (error) throw new Error(error.message)
  revalidatePath(`/painel/promocoes/${promocaoId}`)
}

export async function removerFaixa(faixaId: string, promocaoId: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('faixas_promocao').delete().eq('id', faixaId)
  revalidatePath(`/painel/promocoes/${promocaoId}`)
}

export async function togglePromocao(id: string, ativa: boolean) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('promocoes').update({ ativa: !ativa }).eq('id', id)
  revalidatePath('/painel/promocoes')
  revalidatePath(`/painel/promocoes/${id}`)
}

export async function deletarPromocao(id: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  // apaga os produtos da promoção junto (senão ficam órfãos na tabela)
  await supabase.from('itens_promocao').delete().eq('promocao_id', id)
  await supabase.from('promocoes').delete().eq('id', id)
  revalidatePath('/painel/promocoes')
  redirect('/painel/promocoes')
}

export async function buscarProdutosPromocao(busca: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('produtos')
    .select('id, nome, preco')
    .eq('ativo', true)
    .ilike('nome', `%${busca}%`)
    .limit(8)
  return (data ?? []) as { id: string; nome: string; preco: number }[]
}

export async function adicionarItemPromocao(
  promocaoId: string,
  produtoId: string,
  precoPromocional: number,
  quantidadeX: number | null,
  quantidadeY: number | null,
) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  // Remove se já existir (evita duplicata sem precisar de unique constraint)
  await supabase.from('itens_promocao')
    .delete()
    .eq('promocao_id', promocaoId)
    .eq('produto_id', produtoId)
  await supabase.from('itens_promocao').insert({
    promocao_id: promocaoId,
    produto_id: produtoId,
    preco_promocional: precoPromocional,
    quantidade_x: quantidadeX,
    quantidade_y: quantidadeY,
  })
  revalidatePath(`/painel/promocoes/${promocaoId}`)
}

// Adiciona vários produtos de uma vez (painel em lote). Substitui os que já existem.
export async function adicionarItensLotePromocao(
  promocaoId: string,
  itens: { produto_id: string; preco: number }[],
): Promise<number> {
  await requirePermissao('produtos')
  if (itens.length === 0) return 0
  const supabase = await createServiceClient()
  const ids = itens.map((i) => i.produto_id)
  // remove os que já estavam (evita duplicata sem unique constraint)
  await supabase.from('itens_promocao').delete().eq('promocao_id', promocaoId).in('produto_id', ids)
  const rows = itens.map((i) => ({
    promocao_id: promocaoId,
    produto_id: i.produto_id,
    preco_promocional: i.preco,
    quantidade_x: null,
    quantidade_y: null,
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('itens_promocao').insert(rows.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/painel/promocoes/${promocaoId}`)
  return rows.length
}

export async function removerItemPromocao(itemId: string, promocaoId: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('itens_promocao').delete().eq('id', itemId)
  revalidatePath(`/painel/promocoes/${promocaoId}`)
}

// Remove vários itens da promoção de uma vez (checkbox + "remover selecionados")
export async function removerItensLotePromocao(itemIds: string[], promocaoId: string) {
  await requirePermissao('produtos')
  if (itemIds.length === 0) return
  const supabase = await createServiceClient()
  await supabase.from('itens_promocao').delete().in('id', itemIds)
  revalidatePath(`/painel/promocoes/${promocaoId}`)
}

export async function buscarPromocaoAtivaPorProduto(produtoId: string): Promise<{
  tipo: string
  preco_promocional: number | null
  quantidade_x: number | null
  quantidade_y: number | null
} | null> {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const hoje = hojeSP()

  const { data } = await supabase
    .from('itens_promocao')
    .select('preco_promocional, quantidade_x, quantidade_y, promocoes!inner(tipo, ativa, data_inicio, data_fim)')
    .eq('produto_id', produtoId)
    .eq('promocoes.ativa', true)
    .lte('promocoes.data_inicio', hoje)
    .gte('promocoes.data_fim', hoje)
    .limit(1)
    .maybeSingle()

  if (!data) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promoArr = (data as any).promocoes
  const promo = Array.isArray(promoArr) ? promoArr[0] : promoArr

  return {
    tipo: promo?.tipo ?? '',
    preco_promocional: data.preco_promocional as number | null,
    quantidade_x: data.quantidade_x as number | null,
    quantidade_y: data.quantidade_y as number | null,
  }
}
