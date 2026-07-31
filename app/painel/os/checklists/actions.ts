'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function itensDoForm(formData: FormData): string[] {
  return formData.getAll('item').map((v) => String(v).trim()).filter(Boolean)
}

export async function criarChecklist(formData: FormData) {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  if (!nome) redirect('/painel/os/checklists?erro=' + encodeURIComponent('Dê um nome ao check-list.'))
  await supabase.from('checklists_modelo').insert({ nome, itens: itensDoForm(formData) })
  revalidatePath('/painel/os/checklists')
  redirect('/painel/os/checklists')
}

export async function editarChecklist(id: string, formData: FormData) {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  await supabase.from('checklists_modelo').update({ nome, itens: itensDoForm(formData) }).eq('id', id)
  revalidatePath('/painel/os/checklists')
  redirect('/painel/os/checklists')
}

export async function deletarChecklist(id: string) {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  await supabase.from('checklists_modelo').delete().eq('id', id)
  revalidatePath('/painel/os/checklists')
}
