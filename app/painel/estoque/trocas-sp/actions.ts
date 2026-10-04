'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logAtividade } from '@/lib/log-atividade'

// Troca SP: peça que saiu pra troca/garantia com o fornecedor. Não mexe em estoque
// (a baixa já aconteceu na devolução/venda) — só acompanha o valor que está "na rua"
// até resolver: voltou (fornecedor devolveu) ou abatido (descontou da dívida).
export async function criarTrocaSp(formData: FormData) {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()

  const item = ((formData.get('item') as string) || '').trim()
  const fornecedor = ((formData.get('fornecedor') as string) || '').trim()
  const quantidade = Math.max(1, Math.round(parseFloat((formData.get('quantidade') as string) || '1') || 1))
  const valor = Math.max(0, parseFloat((formData.get('valor') as string) || '0'))
  const lojaId = (formData.get('loja_id') as string) || null
  const observacao = ((formData.get('observacao') as string) || '').trim() || null

  if (!item || !fornecedor) redirect(`/painel/estoque/trocas-sp?erro=${encodeURIComponent('Preencha a peça e o fornecedor.')}`)
  if (!(valor > 0)) redirect(`/painel/estoque/trocas-sp?erro=${encodeURIComponent('Informe o valor da peça.')}`)
  if (!lojaId) redirect(`/painel/estoque/trocas-sp?erro=${encodeURIComponent('Escolha a loja da troca.')}`)

  const { error } = await supabase.from('trocas_sp').insert({
    item, fornecedor, quantidade, valor, loja_id: lojaId, status: 'enviado',
    observacao, criado_por: user.id,
  })
  if (error) redirect(`/painel/estoque/trocas-sp?erro=${encodeURIComponent(error.message)}`)

  await logAtividade('troca_sp.criar', { item, fornecedor, valor, loja_id: lojaId }, user, '/painel/estoque/trocas-sp')
  revalidatePath('/painel/estoque/trocas-sp')
  revalidatePath('/painel/fechamento-mes')
  redirect('/painel/estoque/trocas-sp?ok=1')
}

export async function resolverTrocaSp(id: string, status: 'voltou' | 'abatido') {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('trocas_sp').update({
    status,
    resolvido_em: new Date().toISOString(),
  }).eq('id', id).eq('status', 'enviado')
  if (error) redirect(`/painel/estoque/trocas-sp?erro=${encodeURIComponent(error.message)}`)
  await logAtividade('troca_sp.resolver', { troca_id: id, status }, user, '/painel/estoque/trocas-sp')
  revalidatePath('/painel/estoque/trocas-sp')
  revalidatePath('/painel/fechamento-mes')
  redirect('/painel/estoque/trocas-sp?ok=1')
}

export async function excluirTrocaSp(id: string) {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('trocas_sp').delete().eq('id', id)
  if (error) redirect(`/painel/estoque/trocas-sp?erro=${encodeURIComponent(error.message)}`)
  await logAtividade('troca_sp.excluir', { troca_id: id }, user, '/painel/estoque/trocas-sp')
  revalidatePath('/painel/estoque/trocas-sp')
  revalidatePath('/painel/fechamento-mes')
  redirect('/painel/estoque/trocas-sp?ok=1')
}
