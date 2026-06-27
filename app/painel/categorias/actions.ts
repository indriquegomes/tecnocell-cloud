'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarCategoria(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  if (!nome) redirect(`/painel/categorias?erro=${encodeURIComponent('Nome obrigatório')}`)
  const { error } = await supabase.from('categorias').insert({
    hierarquia: nome,
    nome,
    descricao: (formData.get('descricao') as string)?.trim() || null,
  })
  if (error) redirect(`/painel/categorias?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/categorias')
  redirect('/painel/categorias')
}

export async function editarCategoria(hierarquia: string, formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('categorias').update({
    nome: (formData.get('nome') as string)?.trim(),
    descricao: (formData.get('descricao') as string)?.trim() || null,
  }).eq('hierarquia', hierarquia)
  if (error) redirect(`/painel/categorias?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/categorias')
  redirect('/painel/categorias')
}

export async function deletarCategoria(hierarquia: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('categorias').delete().eq('hierarquia', hierarquia)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/categorias')
}
