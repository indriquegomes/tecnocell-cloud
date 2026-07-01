'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function campos(formData: FormData) {
  return {
    nome: formData.get('nome') as string,
    cnpj: (formData.get('cnpj') as string) || null,
    telefone: (formData.get('telefone') as string) || null,
    endereco: (formData.get('endereco') as string) || null,
    cidade: (formData.get('cidade') as string) || null,
    uf: (formData.get('uf') as string) || null,
  }
}

export async function criarLoja(formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lojas').insert({ ...campos(formData), ativa: true })
  if (error) redirect(`/painel/lojas/nova?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/lojas')
  redirect('/painel/lojas')
}

export async function editarLoja(id: string, formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lojas').update({
    ...campos(formData),
    ativa: formData.get('ativa') === 'true',
  }).eq('id', id)
  if (error) redirect(`/painel/lojas/${id}/editar?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/lojas')
  redirect('/painel/lojas')
}

export async function deletarLoja(id: string) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  // impede apagar loja com depósitos vinculados (evita órfãos)
  const { count } = await supabase.from('depositos').select('*', { count: 'exact', head: true }).eq('loja_id', id)
  if ((count ?? 0) > 0) {
    redirect(`/painel/lojas?erro=${encodeURIComponent('Esta loja tem depósitos vinculados. Mude os depósitos de loja antes de excluir.')}`)
  }
  const { error } = await supabase.from('lojas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/lojas')
}
