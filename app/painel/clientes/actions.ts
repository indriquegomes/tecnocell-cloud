'use server'

import { createServiceClient, requirePermissao, podeAcao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { validarCpfCnpj } from '@/lib/validacoes'

// Foto de comprovação do cliente — vai pro bucket PRIVADO `clientes`. Guardamos só o
// caminho (ex: "<id>.jpg"); a exibição gera URL assinada. Devolve o path ou null.
async function uploadFotoCliente(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  file: File | null,
  id: string,
): Promise<string | null> {
  if (!file || file.size === 0) return null
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${id}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await supabase.storage.from('clientes').upload(path, buffer, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  })
  if (error) return null
  return path
}

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
    // combinado de pagamento do fiado ("paga no fim do dia") — mostrado no crediário do PDV
    rotina_pagamento: txt('rotina_pagamento'),
    // cliente problemático (antes era digitado no nome). getAll() porque o campo tem
    // hidden + checkbox: com get() viria sempre o hidden e nunca marcaria.
    nao_vender: formData.getAll('nao_vender').includes('1'),
    nao_vender_motivo: txt('nao_vender_motivo'),
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

  const campos = camposPessoa(formData, cpfCnpj, email)
  if (!(await podeAcao('credito_limite'))) campos.limite_credito = 0
  const id = crypto.randomUUID()
  const foto_url = await uploadFotoCliente(supabase, formData.get('foto') as File | null, id)
  const { error } = await supabase.from('pessoas').insert({
    id,
    ...campos,
    foto_url,
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

  const campos: Partial<ReturnType<typeof camposPessoa>> & { foto_url?: string } = camposPessoa(formData, cpfCnpj, email)
  // sem permissão: não mexe no limite de crédito (preserva o existente)
  if (!(await podeAcao('credito_limite'))) delete campos.limite_credito
  // só troca a foto se enviaram uma nova (senão preserva a atual)
  const novaFoto = await uploadFotoCliente(supabase, formData.get('foto') as File | null, id)
  if (novaFoto) campos.foto_url = novaFoto
  const { error } = await supabase.from('pessoas').update(campos).eq('id', id)
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

// Criar cliente DIRETO do PDV (o balcão precisa cadastrar quem chegou pra vender na hora).
// Diferente de criarPessoa: usa token (o PDV não tem cookie de action), RETORNA a pessoa
// em vez de redirecionar, e coleta só o essencial + foto opcional. Permissão 'pdv' basta —
// quem opera o caixa pode cadastrar o cliente da venda.
export type ResultadoCriarCliente =
  | { ok: true; pessoa: { id: string; nome: string; cpf_cnpj: string | null; tabela_preco_id: string | null } }
  | { ok: false; erro: string }

export async function criarClientePDV(accessToken: string, formData: FormData): Promise<ResultadoCriarCliente> {
  try {
    await requirePermissao('pdv', accessToken)
    const supabase = await createServiceClient()

    const nome = (formData.get('nome') as string)?.trim()
    if (!nome) return { ok: false, erro: 'Informe o nome do cliente.' }

    const cpfCnpj = (formData.get('cpf_cnpj') as string)?.trim() || ''
    if (cpfCnpj) {
      const { valido } = validarCpfCnpj(cpfCnpj)
      if (!valido) return { ok: false, erro: 'CPF ou CNPJ inválido.' }
      const { data: existente } = await supabase.from('pessoas').select('id, nome').eq('cpf_cnpj', cpfCnpj).maybeSingle()
      if (existente) return { ok: false, erro: `Já existe cadastro com este CPF/CNPJ (${existente.nome}).` }
    }

    const txt = (k: string) => (formData.get(k) as string)?.trim() || null
    const id = crypto.randomUUID()
    const foto_url = await uploadFotoCliente(supabase, formData.get('foto') as File | null, id)

    const { data, error } = await supabase.from('pessoas').insert({
      id,
      nome,
      tipo: 'cliente',
      pessoa_fisica: true,
      ativo: true,
      cpf_cnpj: cpfCnpj || null,
      rg: txt('rg'),
      telefone: txt('telefone'),
      celular: txt('celular'),
      tabela_preco_id: txt('tabela_preco_id'),
      foto_url,
    }).select('id, nome, cpf_cnpj, tabela_preco_id').single()
    if (error) return { ok: false, erro: error.message }

    revalidatePath('/painel/clientes')
    return { ok: true, pessoa: data }
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.message ? e.message : 'Erro ao cadastrar cliente.' }
  }
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
