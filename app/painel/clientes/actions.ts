'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { validarCpfCnpj } from '@/lib/validacoes'

// Campos compartilhados entre criar e editar — Novo e Editar são o mesmo formulário
function camposPessoa(formData: FormData, cpfCnpj: string, email: string) {
  const txt = (k: string) => (formData.get(k) as string)?.trim() || null
  return {
    nome: formData.get('nome') as string,
    nome_fantasia: txt('nome_fantasia'),
    tipo: formData.get('tipo') as string,
    pessoa_fisica: formData.get('pessoa_fisica') === 'true',
    cpf_cnpj: cpfCnpj || null,
    rg: txt('rg'),
    data_nascimento: txt('data_nascimento'),
    email: email || null,
    telefone: txt('telefone'),
    celular: txt('celular'),
    cep: txt('cep'),
    endereco: txt('endereco'),
    numero: txt('numero'),
    complemento: txt('complemento'),
    bairro: txt('bairro'),
    cidade: txt('cidade'),
    estado: txt('estado'),
    tabela_preco_id: txt('tabela_preco_id'),
    limite_credito: parseFloat(formData.get('limite_credito') as string) || 0,
    vendedor_id: txt('vendedor_id'),
    origem: txt('origem'),
    observacoes: txt('observacoes'),
  }
}

export async function criarPessoa(formData: FormData) {
  await requirePermissao('clientes')
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
    ...camposPessoa(formData, cpfCnpj, email),
  })
  if (error) redirect(`/painel/clientes/novo?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/clientes')
  redirect('/painel/clientes')
}

export async function editarPessoa(id: string, formData: FormData) {
  await requirePermissao('clientes')
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

  const { error } = await supabase.from('pessoas').update(camposPessoa(formData, cpfCnpj, email)).eq('id', id)
  if (error) redirect(`/painel/clientes/${id}/editar?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/clientes')
  redirect('/painel/clientes')
}

// Quem já movimentou (venda ou crédito) não pode ser apagado — perderia histórico.
async function temMovimento(supabase: Awaited<ReturnType<typeof createServiceClient>>, id: string) {
  const [{ count: nv }, { count: nc }] = await Promise.all([
    supabase.from('vendas').select('id', { count: 'exact', head: true }).eq('pessoa_id', id),
    supabase.from('creditos_clientes').select('id', { count: 'exact', head: true }).eq('pessoa_id', id),
  ])
  return (nv ?? 0) > 0 || (nc ?? 0) > 0
}

export async function deletarPessoa(id: string) {
  await requirePermissao('clientes')
  const supabase = await createServiceClient()
  if (await temMovimento(supabase, id)) {
    redirect(`/painel/clientes?erro=${encodeURIComponent('Este cadastro já tem histórico (venda/crédito) e não pode ser excluído. Use Inativar.')}`)
  }
  const { error } = await supabase.from('pessoas').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/clientes')
}

export async function inativarPessoa(id: string) {
  await requirePermissao('clientes')
  const supabase = await createServiceClient()
  await supabase.from('pessoas').update({ ativo: false }).eq('id', id)
  revalidatePath('/painel/clientes')
}

export async function reativarPessoa(id: string) {
  await requirePermissao('clientes')
  const supabase = await createServiceClient()
  await supabase.from('pessoas').update({ ativo: true }).eq('id', id)
  revalidatePath('/painel/clientes')
}
