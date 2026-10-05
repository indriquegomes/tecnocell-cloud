'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'

export type CadastroAppResult = { ok: boolean; message: string }

export async function abrirComprovacao(userId: string, accessToken: string) {
  await requirePermissao('clientes', accessToken)
  const service = await createServiceClient()
  const { data: cadastro, error } = await service.from('cadastros_clientes').select('comprovante_path').eq('user_id', userId).maybeSingle()
  if (error || !cadastro?.comprovante_path) throw new Error('Comprovação indisponível.')
  const signed = await service.storage.from('cadastros-clientes').createSignedUrl(cadastro.comprovante_path, 600)
  if (signed.error || !signed.data) throw new Error('Comprovação indisponível.')
  return signed.data.signedUrl
}

export async function buscarPessoasParaVinculo(busca: string, accessToken: string) {
  await requirePermissao('clientes', accessToken)
  const termo = busca.trim()
  if (termo.length < 3 || termo.length > 100) return []
  const service = await createServiceClient()
  const numeros = termo.replace(/\D/g, '')
  const nome = termo.replace(/[%_,()\\]/g, '').trim()
  if (nome.length < 3 && numeros.length < 4) return []
  const query = service.from('pessoas').select('id,nome,cpf_cnpj').eq('ativo', true).limit(10)
  const { data, error } = await (numeros.length >= 4 && /^[\d.\-/\s]+$/.test(termo)
    ? query.ilike('cpf_cnpj', `%${numeros}%`)
    : query.ilike('nome', `%${nome}%`))
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

  if (process.env.CADASTROS_APP_GERENCIAMENTO_ENABLED !== 'true') {
    return { ok: false, message: 'O gerenciamento de acesso ainda não foi liberado. A equipe precisa concluir a validação da integração.' }
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) || !['pendente', 'aprovado', 'bloqueado'].includes(status)) {
    return { ok: false, message: 'Dados inválidos.' }
  }

  const clientesApp = await createServiceClient()
  let pessoaAnterior: string | null = null
  if (status === 'aprovado') {
    if (!pessoaId) return { ok: false, message: 'Selecione uma pessoa cadastrada antes de aprovar.' }
    const { data: cadastro, error: erroCadastro } = await clientesApp.from('cadastros_clientes').select('pessoa_id').eq('user_id', userId).maybeSingle()
    if (erroCadastro || !cadastro) return { ok: false, message: 'Não foi possível conferir o cadastro. Recarregue a página.' }
    if (cadastro.pessoa_id && cadastro.pessoa_id !== pessoaId) return { ok: false, message: 'Esta conta já pertence a outra pessoa. Confira o vínculo existente antes de continuar.' }
    pessoaAnterior = cadastro.pessoa_id
    const { data: pessoa, error: erroPessoa } = await clientesApp.from('pessoas').select('id,ativo,nao_vender').eq('id', pessoaId).maybeSingle()
    if (erroPessoa || !pessoa?.ativo) return { ok: false, message: 'Pessoa não encontrada ou inativa.' }
    if (pessoa.nao_vender) return { ok: false, message: 'Esta pessoa está bloqueada para compras no Cloud. Confira o cadastro antes de aprovar.' }
    const { data: outro, error: erroOutro } = await clientesApp.from('cadastros_clientes').select('user_id').eq('pessoa_id', pessoaId).neq('user_id', userId).limit(1)
    if (erroOutro) return { ok: false, message: 'Não foi possível conferir o vínculo.' }
    if (outro?.length) return { ok: false, message: 'Essa pessoa já está vinculada a outra conta.' }
  }

  let atualizacao = clientesApp
    .from('cadastros_clientes')
    .update(status === 'aprovado' ? { status, pessoa_id: pessoaId } : { status })
    .eq('user_id', userId)
  if (status === 'aprovado') atualizacao = pessoaAnterior === null
    ? atualizacao.is('pessoa_id', null)
    : atualizacao.eq('pessoa_id', pessoaAnterior)
  const { data, error } = await atualizacao
    .select('user_id')
    .maybeSingle()

  if (error) return { ok: false, message: error.code === '23505' ? 'Essa pessoa já está vinculada a outra conta.' : 'Não foi possível atualizar o cadastro. Tente novamente.' }
  if (!data) return { ok: false, message: 'Cadastro não encontrado ou vínculo alterado por outro operador. Recarregue a página.' }

  revalidatePath('/painel/clientes-app')
  revalidatePath('/painel/clientes', 'layout')
  return { ok: true, message: status === 'aprovado' ? 'Cadastro aprovado.' : status === 'bloqueado' ? 'Cadastro bloqueado.' : 'Cadastro voltou para análise.' }
}
