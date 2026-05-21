'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarPedido(formData: FormData) {
  const supabase = await createServiceClient()
  const { data: pedido, error } = await supabase.from('pedidos').insert({
    tipo: formData.get('tipo') as string,
    pessoa_id: (formData.get('pessoa_id') as string) || null,
    observacoes: (formData.get('observacoes') as string) || null,
    data_validade: (formData.get('data_validade') as string) || null,
    status: 'rascunho',
    total: 0,
  }).select('id').single()
  if (error) redirect(`/painel/pedidos/novo?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/pedidos')
  redirect(`/painel/pedidos/${pedido!.id}`)
}

export async function atualizarStatusPedido(id: string, status: string) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/pedidos')
  revalidatePath(`/painel/pedidos/${id}`)
}

export async function deletarPedido(id: string) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/pedidos')
}

export async function adicionarItemPedido(pedidoId: string, formData: FormData) {
  const supabase = await createServiceClient()
  const quantidade = parseFloat(formData.get('quantidade') as string) || 1
  const preco = parseFloat(formData.get('preco_unitario') as string) || 0
  const total = quantidade * preco

  await supabase.from('itens_pedido').insert({
    pedido_id: pedidoId,
    produto_id: formData.get('produto_id') as string,
    quantidade,
    preco_unitario: preco,
    total_item: total,
  })

  // Atualiza total do pedido
  const { data: itens } = await supabase.from('itens_pedido').select('total_item').eq('pedido_id', pedidoId)
  const novoTotal = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  await supabase.from('pedidos').update({ total: novoTotal }).eq('id', pedidoId)

  revalidatePath(`/painel/pedidos/${pedidoId}`)
}

export async function removerItemPedido(itemId: string, pedidoId: string) {
  const supabase = await createServiceClient()
  await supabase.from('itens_pedido').delete().eq('id', itemId)
  const { data: itens } = await supabase.from('itens_pedido').select('total_item').eq('pedido_id', pedidoId)
  const novoTotal = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  await supabase.from('pedidos').update({ total: novoTotal }).eq('id', pedidoId)
  revalidatePath(`/painel/pedidos/${pedidoId}`)
}
