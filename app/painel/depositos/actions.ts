'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarDeposito(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').insert({
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
  })
  if (error) redirect(`/painel/depositos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/depositos')
  redirect('/painel/depositos')
}

export async function editarDeposito(id: string, formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').update({
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
  }).eq('id', id)
  if (error) redirect(`/painel/depositos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/depositos')
  redirect('/painel/depositos')
}

export async function deletarDeposito(id: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/depositos')
}
