'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function extrairCampos(formData: FormData, supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  const empresa_id = (formData.get('empresa_id') as string) || null
  let empresa: string | null = null
  if (empresa_id) {
    const { data } = await supabase.from('empresas').select('nome').eq('id', empresa_id).single()
    empresa = data?.nome ?? null
  }
  return {
    nome:        formData.get('nome') as string,
    empresa_id,
    empresa,
    descricao:   (formData.get('descricao') as string) || null,
    responsavel: (formData.get('responsavel') as string) || null,
    telefone:    (formData.get('telefone') as string) || null,
    email:       (formData.get('email') as string) || null,
    cep:         (formData.get('cep') as string) || null,
    cidade:      (formData.get('cidade') as string) || null,
    uf:          (formData.get('uf') as string) || null,
    ativo:       formData.get('ativo') !== 'false',
  }
}

export async function criarDeposito(formData: FormData) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').insert({ id: crypto.randomUUID(), ...await extrairCampos(formData, supabase) })
  if (error) redirect(`/painel/depositos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/depositos')
  redirect('/painel/depositos')
}

export async function editarDeposito(id: string, formData: FormData) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').update(await extrairCampos(formData, supabase)).eq('id', id)
  if (error) redirect(`/painel/depositos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/depositos')
  redirect('/painel/depositos')
}

export async function deletarDeposito(id: string) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/depositos')
}
