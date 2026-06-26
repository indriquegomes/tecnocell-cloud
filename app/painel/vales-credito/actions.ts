'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export interface ValeCredito {
  id: string
  valor: number
  saldo: number
  motivo: string | null
}

export async function buscarValesCliente(
  accessToken: string,
  pessoaId: string,
): Promise<ValeCredito[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('vales_credito')
    .select('id, valor, saldo, motivo')
    .eq('pessoa_id', pessoaId)
    .eq('status', 'ativo')
    .gt('saldo', 0)
    .order('created_at', { ascending: true })
  return (data ?? []) as ValeCredito[]
}

export async function usarValeNaVenda(
  accessToken: string,
  valeId: string,
  valorUsado: number,
  vendaId: string,
): Promise<void> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()

  const { data: vale, error: eB } = await supabase
    .from('vales_credito')
    .select('saldo')
    .eq('id', valeId)
    .single()
  if (eB || !vale) throw new Error('Vale não encontrado')
  if (vale.saldo < valorUsado - 0.01) throw new Error('Saldo insuficiente no vale')

  const novoSaldo = Math.max(0, vale.saldo - valorUsado)
  const novoStatus = novoSaldo < 0.01 ? 'usado' : 'ativo'

  const { error } = await supabase
    .from('vales_credito')
    .update({ saldo: novoSaldo, status: novoStatus })
    .eq('id', valeId)
  if (error) throw new Error(error.message)
}

export async function criarVale(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()

  const valor = parseFloat(formData.get('valor') as string) || 0

  const { error } = await supabase.from('vales_credito').insert({
    pessoa_id: formData.get('pessoa_id') as string || null,
    valor,
    saldo: valor,
    motivo: formData.get('motivo') as string || null,
    status: 'ativo',
  })

  if (error) redirect(`/painel/vales-credito?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/vales-credito')
  redirect('/painel/vales-credito?ok=1')
}

export async function cancelarVale(id: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('vales_credito')
    .update({ status: 'cancelado' })
    .eq('id', id)
  if (error) redirect(`/painel/vales-credito?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/vales-credito')
  redirect('/painel/vales-credito')
}
