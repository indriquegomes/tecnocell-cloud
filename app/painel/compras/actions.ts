'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarNotaEntrada(formData: FormData) {
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
  const supabase = await createServiceClient()
  // Busca itens da nota e dá entrada no estoque
  const { data: itens } = await supabase
    .from('itens_nota_entrada')
    .select('produto_id, quantidade, deposito_id')
    .eq('nota_id', id)

  for (const item of itens ?? []) {
    if (!item.produto_id || !item.deposito_id) continue
    const { data: est } = await supabase
      .from('estoque')
      .select('quantidade')
      .eq('produto_id', item.produto_id)
      .eq('deposito_id', item.deposito_id)
      .single()

    if (est) {
      await supabase.from('estoque').update({
        quantidade: (est.quantidade ?? 0) + item.quantidade,
      }).eq('produto_id', item.produto_id).eq('deposito_id', item.deposito_id)
    } else {
      await supabase.from('estoque').insert({
        produto_id: item.produto_id,
        deposito_id: item.deposito_id,
        quantidade: item.quantidade,
      })
    }
  }

  await supabase.from('notas_entrada').update({ status: 'recebida' }).eq('id', id)
  revalidatePath('/painel/compras')
  revalidatePath(`/painel/compras/${id}`)
}

export async function deletarNota(id: string) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('notas_entrada').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/compras')
}

export async function adicionarItemNota(notaId: string, formData: FormData) {
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
