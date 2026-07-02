'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function campos(formData: FormData) {
  const maxP = Math.max(1, parseInt(formData.get('max_parcelas') as string) || 1)
  let taxas: number[] = []
  try {
    taxas = (JSON.parse((formData.get('taxas_credito') as string) || '[]') as unknown[])
      .map((x) => Number(x) || 0)
  } catch {}
  // garante tamanho = max_parcelas (preenche com 0 o que faltar)
  const taxasCredito = Array.from({ length: maxP }, (_, i) => taxas[i] ?? 0)
  return {
    nome: formData.get('nome') as string,
    taxa_debito: parseFloat(formData.get('taxa_debito') as string) || 0,
    taxas_credito: taxasCredito,
    max_parcelas: maxP,
  }
}

export async function criarMaquina(formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('maquinas_cartao').insert({ ...campos(formData), ativo: true })
  if (error) redirect(`/painel/maquinas-cartao?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/maquinas-cartao')
  revalidatePath('/painel/pdv')
  redirect('/painel/maquinas-cartao')
}

export async function editarMaquina(id: string, formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('maquinas_cartao')
    .update({ ...campos(formData), ativo: formData.get('ativo') === 'true' })
    .eq('id', id)
  if (error) redirect(`/painel/maquinas-cartao?editar=${id}&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/maquinas-cartao')
  revalidatePath('/painel/pdv')
  redirect('/painel/maquinas-cartao')
}

export async function deletarMaquina(id: string) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('maquinas_cartao').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/maquinas-cartao')
  revalidatePath('/painel/pdv')
}
