'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function campos(formData: FormData) {
  const saldoRaw = parseFloat((formData.get('saldo_inicial') as string) || '0')
  return {
    nome: (formData.get('nome') as string)?.trim(),
    tipo: (formData.get('tipo') as string) === 'caixa' ? 'caixa' : 'banco',
    saldo_inicial: isNaN(saldoRaw) ? 0 : saldoRaw,
  }
}

export async function criarConta(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas').insert({ ...campos(formData), ativa: true })
  if (error) redirect(`/painel/contas?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/contas')
  revalidatePath('/painel/formas-pagamento')
  redirect('/painel/contas')
}

export async function editarConta(id: string, formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas')
    .update({ ...campos(formData), ativa: formData.get('ativa') === 'true' })
    .eq('id', id)
  if (error) redirect(`/painel/contas?editar=${id}&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/contas')
  revalidatePath('/painel/formas-pagamento')
  redirect('/painel/contas')
}

export async function criarTransferencia(formData: FormData) {
  await requirePermissao('financeiro')
  const origem = formData.get('conta_origem_id') as string
  const destino = formData.get('conta_destino_id') as string
  const valor = parseFloat(formData.get('valor') as string) || 0
  const data = (formData.get('data') as string) || hojeSP()
  const observacao = ((formData.get('observacao') as string) || '').trim() || null
  const err = (m: string) => redirect(`/painel/contas?erro=${encodeURIComponent(m)}`)
  if (!origem || !destino) err('Escolha a conta de origem e a de destino.')
  if (origem === destino) err('Origem e destino não podem ser a mesma conta.')
  if (valor <= 0) err('Informe um valor maior que zero.')

  const supabase = await createServiceClient()
  const { error } = await supabase.from('transferencias').insert({ conta_origem_id: origem, conta_destino_id: destino, valor, data, observacao })
  if (error) err(error.message)
  revalidatePath('/painel/contas')
  redirect('/painel/contas')
}

export async function deletarTransferencia(id: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  await supabase.from('transferencias').delete().eq('id', id)
  revalidatePath('/painel/contas')
}

export async function deletarConta(id: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas').delete().eq('id', id)
  if (error) redirect(`/painel/contas?erro=${encodeURIComponent('Não dá pra excluir: há formas de pagamento usando esta conta.')}`)
  revalidatePath('/painel/contas')
}
