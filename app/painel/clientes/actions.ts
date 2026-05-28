'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { validarCpfCnpj } from '@/lib/validacoes'

export async function criarPessoa(formData: FormData) {
  const supabase = await createServiceClient()

  const cpfCnpj = (formData.get('cpf_cnpj') as string)?.trim()
  if (cpfCnpj) {
    const { valido } = validarCpfCnpj(cpfCnpj)
    if (!valido) redirect(`/painel/clientes/novo?erro=${encodeURIComponent('CPF ou CNPJ inválido.')}`)
    const { data: existente } = await supabase.from('pessoas').select('id').eq('cpf_cnpj', cpfCnpj).maybeSingle()
    if (existente) redirect(`/painel/clientes/novo?erro=${encodeURIComponent('Já existe um cadastro com este CPF/CNPJ.')}`)
  }

  const email = (formData.get('email') as string)?.trim()
  if (email) {
    const { data: existente } = await supabase.from('pessoas').select('id').eq('email', email).maybeSingle()
    if (existente) redirect(`/painel/clientes/novo?erro=${encodeURIComponent('Já existe um cadastro com este e-mail.')}`)
  }

  const { error } = await supabase.from('pessoas').insert({
    id: crypto.randomUUID(),
    nome: formData.get('nome') as string,
    tipo: formData.get('tipo') as string,
    pessoa_fisica: formData.get('pessoa_fisica') === 'true',
    cpf_cnpj: cpfCnpj || null,
    email: email || null,
    telefone: (formData.get('telefone') as string) || null,
    cidade: (formData.get('cidade') as string) || null,
    estado: (formData.get('estado') as string) || null,
  })
  if (error) redirect(`/painel/clientes/novo?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/clientes')
  redirect('/painel/clientes')
}

export async function editarPessoa(id: string, formData: FormData) {
  const supabase = await createServiceClient()

  const cpfCnpj = (formData.get('cpf_cnpj') as string)?.trim()
  if (cpfCnpj) {
    const { valido } = validarCpfCnpj(cpfCnpj)
    if (!valido) redirect(`/painel/clientes/${id}/editar?erro=${encodeURIComponent('CPF ou CNPJ inválido.')}`)
    const { data: existente } = await supabase.from('pessoas').select('id').eq('cpf_cnpj', cpfCnpj).neq('id', id).maybeSingle()
    if (existente) redirect(`/painel/clientes/${id}/editar?erro=${encodeURIComponent('Já existe outro cadastro com este CPF/CNPJ.')}`)
  }

  const email = (formData.get('email') as string)?.trim()
  if (email) {
    const { data: existente } = await supabase.from('pessoas').select('id').eq('email', email).neq('id', id).maybeSingle()
    if (existente) redirect(`/painel/clientes/${id}/editar?erro=${encodeURIComponent('Já existe outro cadastro com este e-mail.')}`)
  }

  const { error } = await supabase.from('pessoas').update({
    nome: formData.get('nome') as string,
    tipo: formData.get('tipo') as string,
    pessoa_fisica: formData.get('pessoa_fisica') === 'true',
    cpf_cnpj: cpfCnpj || null,
    email: email || null,
    telefone: (formData.get('telefone') as string) || null,
    cidade: (formData.get('cidade') as string) || null,
    estado: (formData.get('estado') as string) || null,
  }).eq('id', id)
  if (error) redirect(`/painel/clientes/${id}/editar?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/clientes')
  redirect('/painel/clientes')
}

export async function deletarPessoa(id: string) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pessoas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/clientes')
}
