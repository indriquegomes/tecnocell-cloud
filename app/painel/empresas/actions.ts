'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarEmpresa(formData: FormData) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('empresas').insert({
    nome: formData.get('nome') as string,
    cnpj: (formData.get('cnpj') as string) || null,
    telefone: (formData.get('telefone') as string) || null,
    email: (formData.get('email') as string) || null,
    endereco: (formData.get('endereco') as string) || null,
    cidade: (formData.get('cidade') as string) || null,
    estado: (formData.get('estado') as string) || null,
    ativa: true,
  })
  if (error) redirect(`/painel/empresas?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/empresas')
  redirect('/painel/empresas')
}

export async function editarEmpresa(id: string, formData: FormData) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('empresas').update({
    nome: formData.get('nome') as string,
    cnpj: (formData.get('cnpj') as string) || null,
    telefone: (formData.get('telefone') as string) || null,
    email: (formData.get('email') as string) || null,
    endereco: (formData.get('endereco') as string) || null,
    cidade: (formData.get('cidade') as string) || null,
    estado: (formData.get('estado') as string) || null,
    ativa: formData.get('ativa') === 'true',
  }).eq('id', id)
  if (error) redirect(`/painel/empresas/${id}/editar?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/empresas')
  redirect('/painel/empresas')
}

export async function deletarEmpresa(id: string) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('empresas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/empresas')
}
