'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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
