'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarFormaPagamento(formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('formas_pagamento').insert({
    id: crypto.randomUUID(),
    nome: formData.get('nome') as string,
    ativo: true,
  })
  if (error) redirect(`/painel/formas-pagamento?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/formas-pagamento')
  redirect('/painel/formas-pagamento')
}

export async function editarFormaPagamento(id: string, formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('formas_pagamento').update({
    nome: formData.get('nome') as string,
    ativo: formData.get('ativo') === 'true',
  }).eq('id', id)
  if (error) redirect(`/painel/formas-pagamento?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/formas-pagamento')
  redirect('/painel/formas-pagamento')
}

export async function deletarFormaPagamento(id: string) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('formas_pagamento').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/formas-pagamento')
}
