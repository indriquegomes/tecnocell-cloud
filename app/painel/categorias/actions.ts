'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarCategoria(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('categorias').insert({
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
  })
  if (error) redirect(`/painel/categorias?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/categorias')
  redirect('/painel/categorias')
}

export async function editarCategoria(id: string, formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('categorias').update({
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
  }).eq('id', id)
  if (error) redirect(`/painel/categorias?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/categorias')
  redirect('/painel/categorias')
}

export async function deletarCategoria(id: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('categorias').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/categorias')
}
