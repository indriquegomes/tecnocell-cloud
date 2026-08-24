'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarNotaEntrada(formData: FormData) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  // NF é opcional: se vier vazio, gera um número aleatório de 6 dígitos
  // (pra não precisar digitar quando a mercadoria chega sem nota).
  const numeroInformado = ((formData.get('numero') as string) || '').trim()
  const numeroNota = numeroInformado || String(Math.floor(100000 + Math.random() * 900000))
  const { data: nota, error } = await supabase.from('notas_entrada').insert({
    numero: numeroNota,
    fornecedor_id: (formData.get('fornecedor_id') as string) || null,
    data_emissao: (formData.get('data_emissao') as string) || null,
    data_entrada: (formData.get('data_entrada') as string) || hojeSP(),
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

  // Checagem antecipada: produto com controla_serie precisa ter um IMEI
  // cadastrado pra cada unidade da nota. O RPC também trava isso (defesa em
  // profundidade), mas checar aqui antes dá uma mensagem com o nome do
  // produto — o RPC só tem o id.
  const { data: itens } = await supabase.from('itens_nota_entrada').select('produto_id, quantidade, series').eq('nota_id', id)
  if (itens && itens.length > 0) {
    const produtoIds = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))] as string[]
    const { data: produtos } = await supabase.from('produtos').select('id, nome, controla_serie').in('id', produtoIds)
    const produtoPorId = new Map((produtos ?? []).map((p) => [p.id, p]))
    for (const item of itens) {
      const produto = item.produto_id ? produtoPorId.get(item.produto_id) : null
      if (!produto?.controla_serie) continue
      const qtdSeries = Array.isArray(item.series) ? item.series.length : 0
      if (qtdSeries !== item.quantidade) {
        redirect(`/painel/compras/${id}?erro=${encodeURIComponent(`"${produto.nome}" controla IMEI: faltam ${item.quantidade - qtdSeries} de ${item.quantidade} pra cadastrar antes de confirmar.`)}`)
      }
    }
  }

  // entrada atômica no estoque + IMEIs + atualiza custo do produto (tudo ou nada)
  const { error } = await supabase.rpc('receber_nota_entrada', { p_nota_id: id })
  if (error) redirect(`/painel/compras/${id}?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/compras')
  revalidatePath(`/painel/compras/${id}`)
  revalidatePath('/painel/estoque')
}

// Salva a lista de IMEIs digitados/lidos pra um item da nota (produto
// controla_serie). Substitui a lista inteira — mais simples que diff.
export async function salvarSeriesItem(itemId: string, notaId: string, series: string[]) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  const limpas = [...new Set(series.map((s) => s.trim()).filter(Boolean))]
  const { error } = await supabase.from('itens_nota_entrada').update({ series: limpas }).eq('id', itemId)
  if (error) return { ok: false, erro: error.message }
  revalidatePath(`/painel/compras/${notaId}`)
  return { ok: true }
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

export async function editarNota(id: string, formData: FormData) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  const { data: nota } = await supabase.from('notas_entrada').select('status').eq('id', id).maybeSingle()
  if (nota?.status !== 'pendente') {
    redirect(`/painel/compras/${id}?erro=${encodeURIComponent('Só dá pra editar uma nota pendente.')}`)
  }
  await supabase.from('notas_entrada').update({
    numero: (formData.get('numero') as string)?.trim() || null,
    fornecedor_id: (formData.get('fornecedor_id') as string) || null,
    data_emissao: (formData.get('data_emissao') as string) || null,
    data_entrada: (formData.get('data_entrada') as string) || hojeSP(),
    observacoes: (formData.get('observacoes') as string)?.trim() || null,
  }).eq('id', id)
  revalidatePath(`/painel/compras/${id}`)
  redirect(`/painel/compras/${id}`)
}

export async function removerItemNota(itemId: string, notaId: string) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  await supabase.from('itens_nota_entrada').delete().eq('id', itemId)
  const { data: itens } = await supabase.from('itens_nota_entrada').select('total_item').eq('nota_id', notaId)
  const total = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  await supabase.from('notas_entrada').update({ valor_total: total }).eq('id', notaId)
  revalidatePath(`/painel/compras/${notaId}`)
}

export async function editarItemNota(itemId: string, notaId: string, formData: FormData) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  const quantidade = Math.round(parseFloat(formData.get('quantidade') as string)) || 1
  const preco = parseFloat(formData.get('preco_unitario') as string) || 0
  await supabase.from('itens_nota_entrada')
    .update({ quantidade, preco_unitario: preco, total_item: quantidade * preco })
    .eq('id', itemId)
  const { data: itens } = await supabase.from('itens_nota_entrada').select('total_item').eq('nota_id', notaId)
  const total = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  await supabase.from('notas_entrada').update({ valor_total: total }).eq('id', notaId)
  revalidatePath(`/painel/compras/${notaId}`)
}

export async function adicionarItemNota(notaId: string, formData: FormData) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  const quantidade = Math.round(parseFloat(formData.get('quantidade') as string)) || 1
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
