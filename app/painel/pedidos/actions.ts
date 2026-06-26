'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarPedido(formData: FormData) {
  const usuario = await requireAuth()
  const supabase = await createServiceClient()

  // Captura nome do vendedor
  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', usuario.id)
    .maybeSingle()
  const vendedorNome = (perfil as { nome?: string } | null)?.nome ?? usuario.email ?? ''

  const { data: pedido, error } = await supabase.from('pedidos').insert({
    tipo:               formData.get('tipo') as string,
    pessoa_id:          (formData.get('pessoa_id') as string) || null,
    observacoes:        (formData.get('observacoes') as string) || null,
    data_validade:      (formData.get('data_validade') as string) || null,
    deposito_id:        (formData.get('deposito_id') as string) || null,
    tabela_preco_id:    (formData.get('tabela_preco_id') as string) || null,
    forma_pagamento_id: (formData.get('forma_pagamento_id') as string) || null,
    origem:             (formData.get('origem') as string) || 'balcao',
    vendedor_id:        usuario.id,
    vendedor_nome:      vendedorNome,
    status: 'rascunho',
    total: 0,
  }).select('id').single()
  if (error) redirect(`/painel/pedidos/novo?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/pedidos')
  redirect(`/painel/pedidos/${pedido!.id}`)
}

export async function atualizarStatusPedido(id: string, status: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/pedidos')
  revalidatePath(`/painel/pedidos/${id}`)
}

export async function deletarPedido(id: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/pedidos')
}

export async function adicionarItemPedido(pedidoId: string, formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const quantidade = parseFloat(formData.get('quantidade') as string) || 1
  const preco = parseFloat(formData.get('preco_unitario') as string) || 0
  const total = quantidade * preco

  const { error } = await supabase.from('itens_pedido').insert({
    pedido_id: pedidoId,
    produto_id: formData.get('produto_id') as string,
    quantidade,
    preco_unitario: preco,
    total_item: total,
  })
  if (error) return { error: error.message }

  const { data: ped } = await supabase.from('pedidos').select('desconto, frete').eq('id', pedidoId).single()
  const { data: itens } = await supabase.from('itens_pedido').select('total_item').eq('pedido_id', pedidoId)
  const subtotal = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const novoTotal = Math.max(0, subtotal - (ped?.desconto ?? 0) + (ped?.frete ?? 0))
  await supabase.from('pedidos').update({ total: novoTotal }).eq('id', pedidoId)

  revalidatePath(`/painel/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function atualizarDescontoFrete(id: string, desconto: number, frete: number) {
  await requireAuth()
  const supabase = await createServiceClient()
  // recalcula total com os itens existentes
  const { data: itens } = await supabase.from('itens_pedido').select('total_item').eq('pedido_id', id)
  const subtotal = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const total = Math.max(0, subtotal - desconto + frete)
  const { error } = await supabase.from('pedidos').update({ desconto, frete, total }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/painel/pedidos/${id}`)
  return { ok: true }
}

export async function atualizarInfoPedido(
  id: string,
  dados: { deposito_id?: string | null; forma_pagamento_id?: string | null; origem?: string | null }
) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').update(dados).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/painel/pedidos/${id}`)
  return { ok: true }
}

export async function removerItemPedido(itemId: string, pedidoId: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('itens_pedido').delete().eq('id', itemId)
  const { data: ped } = await supabase.from('pedidos').select('desconto, frete').eq('id', pedidoId).single()
  const { data: itens } = await supabase.from('itens_pedido').select('total_item').eq('pedido_id', pedidoId)
  const subtotal = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const novoTotal = Math.max(0, subtotal - (ped?.desconto ?? 0) + (ped?.frete ?? 0))
  await supabase.from('pedidos').update({ total: novoTotal }).eq('id', pedidoId)
  revalidatePath(`/painel/pedidos/${pedidoId}`)
}
