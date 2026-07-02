'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarNotaEntrada(formData: FormData) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  const { data: nota, error } = await supabase.from('notas_entrada').insert({
    numero: (formData.get('numero') as string) || null,
    fornecedor_id: (formData.get('fornecedor_id') as string) || null,
    data_emissao: (formData.get('data_emissao') as string) || null,
    data_entrada: (formData.get('data_entrada') as string) || new Date().toISOString().split('T')[0],
    observacoes: (formData.get('observacoes') as string) || null,
    status: 'pendente',
    valor_total: 0,
  }).select('id').single()
  if (error) redirect(`/painel/compras/nova?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/compras')
  redirect(`/painel/compras/${nota!.id}`)
}

export async function receberNota(id: string) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  // entrada atômica no estoque + atualiza custo do produto (tudo ou nada)
  const { error } = await supabase.rpc('receber_nota_entrada', { p_nota_id: id })
  if (error) redirect(`/painel/compras/${id}?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/compras')
  revalidatePath(`/painel/compras/${id}`)
  revalidatePath('/painel/estoque')
}

export async function estornarNota(id: string) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  // devolve o estoque e marca cancelada (atômico)
  const { error } = await supabase.rpc('estornar_nota_entrada', { p_nota_id: id })
  if (error) redirect(`/painel/compras/${id}?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/compras')
  revalidatePath(`/painel/compras/${id}`)
  revalidatePath('/painel/estoque')
}

export async function deletarNota(id: string) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  // nota recebida mexeu no estoque — não pode sumir sem estornar antes
  const { data: nota } = await supabase.from('notas_entrada').select('status').eq('id', id).maybeSingle()
  if (nota?.status === 'recebida') {
    redirect(`/painel/compras?erro=${encodeURIComponent('Esta nota já foi recebida (mexeu no estoque). Estorne a nota antes de excluir.')}`)
  }
  await supabase.from('itens_nota_entrada').delete().eq('nota_id', id)
  const { error } = await supabase.from('notas_entrada').delete().eq('id', id)
  if (error) redirect(`/painel/compras?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/compras')
}

export async function adicionarItemNota(notaId: string, formData: FormData) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  const quantidade = parseFloat(formData.get('quantidade') as string) || 1
  const preco = parseFloat(formData.get('preco_unitario') as string) || 0

  await supabase.from('itens_nota_entrada').insert({
    nota_id: notaId,
    produto_id: formData.get('produto_id') as string,
    deposito_id: formData.get('deposito_id') as string,
    quantidade,
    preco_unitario: preco,
    total_item: quantidade * preco,
  })

  const { data: itens } = await supabase.from('itens_nota_entrada').select('total_item').eq('nota_id', notaId)
  const total = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  await supabase.from('notas_entrada').update({ valor_total: total }).eq('id', notaId)

  revalidatePath(`/painel/compras/${notaId}`)
}
