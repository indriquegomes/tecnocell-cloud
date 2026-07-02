'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { validarCpfCnpj } from '@/lib/validacoes'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function campos(formData: FormData) {
  const txt = (k: string) => (formData.get(k) as string)?.trim() || null
  return {
    nome: formData.get('nome') as string,
    razao_social: txt('razao_social'),
    cnpj: txt('cnpj'),
    inscricao_estadual: txt('inscricao_estadual'),
    telefone: txt('telefone'),
    cep: txt('cep'),
    endereco: txt('endereco'),
    numero: txt('numero'),
    bairro: txt('bairro'),
    cidade: txt('cidade'),
    uf: txt('uf'),
  }
}

export async function criarLoja(formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const cnpj = (formData.get('cnpj') as string)?.trim()
  if (cnpj) {
    const { valido } = validarCpfCnpj(cnpj)
    if (!valido) redirect(`/painel/lojas/nova?erro=${encodeURIComponent('CNPJ inválido.')}`)
    const { data: ex } = await supabase.from('lojas').select('id').eq('cnpj', cnpj).maybeSingle()
    if (ex) redirect(`/painel/lojas/nova?erro=${encodeURIComponent('Já existe uma loja com este CNPJ.')}`)
  }
  const { error } = await supabase.from('lojas').insert({ ...campos(formData), ativa: true })
  if (error) redirect(`/painel/lojas/nova?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/lojas')
  redirect('/painel/lojas')
}

export async function editarLoja(id: string, formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const cnpj = (formData.get('cnpj') as string)?.trim()
  if (cnpj) {
    const { valido } = validarCpfCnpj(cnpj)
    if (!valido) redirect(`/painel/lojas/${id}/editar?erro=${encodeURIComponent('CNPJ inválido.')}`)
    const { data: ex } = await supabase.from('lojas').select('id').eq('cnpj', cnpj).neq('id', id).maybeSingle()
    if (ex) redirect(`/painel/lojas/${id}/editar?erro=${encodeURIComponent('Já existe outra loja com este CNPJ.')}`)
  }
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
