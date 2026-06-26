'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarPromocao(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()

  const tipo = formData.get('tipo') as string
  const { data, error } = await supabase.from('promocoes').insert({
    nome: formData.get('nome') as string,
    tipo,
    valor: parseFloat(formData.get('valor') as string) || 0,
    data_inicio: formData.get('data_inicio') as string || null,
    data_fim: formData.get('data_fim') as string || null,
    descricao: formData.get('descricao') as string || null,
    ativa: true,
  }).select('id').single()

  if (error) redirect(`/painel/promocoes?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/promocoes')
  redirect(`/painel/promocoes/${data!.id}`)
}

export async function togglePromocao(id: string, ativa: boolean) {
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('promocoes').update({ ativa: !ativa }).eq('id', id)
  revalidatePath('/painel/promocoes')
  revalidatePath(`/painel/promocoes/${id}`)
}

export async function deletarPromocao(id: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('promocoes').delete().eq('id', id)
  revalidatePath('/painel/promocoes')
  redirect('/painel/promocoes')
}

export async function buscarProdutosPromocao(busca: string) {
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
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('itens_promocao').upsert({
    promocao_id: promocaoId,
    produto_id: produtoId,
    preco_promocional: precoPromocional,
    quantidade_x: quantidadeX,
    quantidade_y: quantidadeY,
  }, { onConflict: 'promocao_id,produto_id' })
  revalidatePath(`/painel/promocoes/${promocaoId}`)
}

export async function removerItemPromocao(itemId: string, promocaoId: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('itens_promocao').delete().eq('id', itemId)
  revalidatePath(`/painel/promocoes/${promocaoId}`)
}

export async function buscarPromocaoAtivaPorProduto(produtoId: string): Promise<{
  tipo: string
  preco_promocional: number | null
  quantidade_x: number | null
  quantidade_y: number | null
} | null> {
  const supabase = await createServiceClient()
  const hoje = new Date().toISOString().split('T')[0]

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

  const promo = (data as { preco_promocional: number | null; quantidade_x: number | null; quantidade_y: number | null; promocoes: { tipo: string } }).promocoes

  return {
    tipo: promo.tipo,
    preco_promocional: data.preco_promocional,
    quantidade_x: data.quantidade_x,
    quantidade_y: data.quantidade_y,
  }
}
