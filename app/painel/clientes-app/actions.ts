'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'

export type CadastroAppResult = { ok: boolean; message: string }

export async function buscarPessoasParaVinculo(busca: string, accessToken: string) {
  await requirePermissao('clientes', accessToken)
  const termo = busca.trim()
  if (termo.length < 3) return []
  const service = await createServiceClient()
  const numeros = termo.replace(/\D/g, '')
  const query = service.from('pessoas').select('id,nome,cpf_cnpj').eq('ativo', true).limit(10)
  const { data, error } = await (numeros.length >= 4 && /^[\d.\-/\s]+$/.test(termo)
    ? query.ilike('cpf_cnpj', `%${numeros}%`)
    : query.ilike('nome', `%${termo.replace(/[%_,]/g, '')}%`))
  if (error) throw new Error('Não foi possível buscar pessoas.')
  return data ?? []
}

export async function alterarStatusCadastro(
  userId: string,
  status: 'pendente' | 'aprovado' | 'bloqueado',
  pessoaId: string | null,
  accessToken: string,
): Promise<CadastroAppResult> {
  try {
    await requirePermissao('clientes', accessToken)
  } catch {
    return { ok: false, message: 'Não autorizado.' }
  }

  if (!userId || !['pendente', 'aprovado', 'bloqueado'].includes(status)) {
    return { ok: false, message: 'Dados inválidos.' }
  }

  const clientesApp = await createServiceClient()
  if (status === 'aprovado') {
    if (!pessoaId) return { ok: false, message: 'Selecione uma pessoa cadastrada antes de aprovar.' }
    const { data: pessoa, error: erroPessoa } = await clientesApp.from('pessoas').select('id,ativo').eq('id', pessoaId).maybeSingle()
    if (erroPessoa || !pessoa?.ativo) return { ok: false, message: 'Pessoa não encontrada ou inativa.' }
    const { data: outro, error: erroOutro } = await clientesApp.from('cadastros_clientes').select('user_id').eq('pessoa_id', pessoaId).neq('user_id', userId).limit(1)
    if (erroOutro) return { ok: false, message: 'Não foi possível conferir o vínculo.' }
    if (outro?.length) return { ok: false, message: 'Essa pessoa já está vinculada a outra conta.' }
  }

  const { data, error } = await clientesApp
    .from('cadastros_clientes')
    .update(status === 'aprovado' ? { status, pessoa_id: pessoaId } : { status })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle()

  if (error) return { ok: false, message: error.message }
  if (!data) return { ok: false, message: 'Cadastro não encontrado.' }

  revalidatePath('/painel/clientes-app')
  return { ok: true, message: status === 'aprovado' ? 'Cadastro aprovado.' : status === 'bloqueado' ? 'Cadastro bloqueado.' : 'Cadastro voltou para análise.' }
}
