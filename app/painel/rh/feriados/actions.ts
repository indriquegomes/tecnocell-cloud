'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarFeriado(formData: FormData) {
  await requirePermissao('rh')
  const s = await createServiceClient()
  const cidade = formData.get('cidade') as string
  const data = formData.get('data') as string
  const nome = ((formData.get('nome') as string) || '').trim()
  const tipo = (formData.get('tipo') as string) || 'municipal'
  if (!cidade || !data || !nome) redirect('/painel/rh/feriados?erro=Preencha cidade, data e nome')
  await s.from('feriados').insert({ cidade, data, nome, tipo })
  revalidatePath('/painel/rh/feriados')
  redirect('/painel/rh/feriados?ok=1')
}

export async function excluirFeriado(id: string) {
  await requirePermissao('rh')
  const s = await createServiceClient()
  await s.from('feriados').delete().eq('id', id)
  revalidatePath('/painel/rh/feriados')
}
