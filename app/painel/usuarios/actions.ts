'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { TODAS_PERMISSOES } from '@/lib/permissoes'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }
export type ConviteResult = { ok: true; message: string; link: string } | { ok: false; message: string }

const TODAS_KEYS = TODAS_PERMISSOES.map((p) => p.key)

export async function criarConvite(_: ConviteResult | null, fd: FormData): Promise<ConviteResult> {
  const token = fd.get('access_token') as string
  let admin: { id: string }
  try { admin = await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }

  const email    = (fd.get('email') as string ?? '').trim()
  const nome     = (fd.get('nome') as string ?? '').trim()
  const isMaster = fd.getAll('is_master').includes('1')
  const perms    = fd.getAll('permissoes') as string[]
  if (!email || !nome) return { ok: false, message: 'Preencha nome e e-mail' }

  const supabase = await createServiceClient()

  // Conta criada com senha aleatória — a funcionária define a real pelo link
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email, password: crypto.randomUUID(), email_confirm: true,
  })
  if (authErr || !authData.user) return { ok: false, message: authErr?.message ?? 'Erro ao criar conta' }

  const cargoId = (fd.get('cargo_id') as string) || null
  const { error: perfErr } = await supabase.from('perfis').insert({
    id: authData.user.id, nome, permissoes: isMaster ? TODAS_KEYS : perms, is_master: isMaster, ativo: true, cargo_id: cargoId,
  })
  if (perfErr) { await supabase.auth.admin.deleteUser(authData.user.id); return { ok: false, message: perfErr.message } }

  const conviteToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const expira = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const { error: cErr } = await supabase.from('convites').insert({
    token: conviteToken, user_id: authData.user.id, nome, expires_at: expira, criado_por: admin.id,
  })
  if (cErr) { await supabase.auth.admin.deleteUser(authData.user.id); return { ok: false, message: cErr.message } }

  revalidatePath('/painel/usuarios')
  return { ok: true, message: `Convite criado para ${nome}`, link: `/convite/${conviteToken}` }
}

export async function criarUsuario(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  try { await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }

  const email    = (fd.get('email') as string ?? '').trim()
  const senha    = (fd.get('senha') as string ?? '').trim()
  const nome     = (fd.get('nome') as string ?? '').trim()
  const isMaster = fd.getAll('is_master').includes('1')
  const perms    = fd.getAll('permissoes') as string[]

  if (!email || !senha || !nome) return { ok: false, message: 'Preencha todos os campos obrigatórios' }
  if (senha.length < 4) return { ok: false, message: 'Senha deve ter ao menos 4 caracteres' }

  const supabase = await createServiceClient()

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })

  if (authErr || !authData.user) {
    return { ok: false, message: authErr?.message ?? 'Erro ao criar conta' }
  }

  const { error: perfErr } = await supabase.from('perfis').insert({
    id: authData.user.id,
    nome,
    permissoes: isMaster ? TODAS_KEYS : perms,
    is_master: isMaster,
    ativo: true,
    cargo_id: (fd.get('cargo_id') as string) || null,
  })

  if (perfErr) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return { ok: false, message: perfErr.message }
  }

  revalidatePath('/painel/usuarios')
  return { ok: true, message: `Usuário ${nome} criado com sucesso` }
}

export async function atualizarPerfil(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  try { await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }

  const userId   = fd.get('user_id') as string
  const nome     = (fd.get('nome') as string ?? '').trim()
  const isMaster = fd.getAll('is_master').includes('1')
  const ativo    = fd.getAll('ativo').includes('1')
  const perms    = fd.getAll('permissoes') as string[]

  if (!userId || !nome) return { ok: false, message: 'Dados inválidos' }

  // Config operacional (lojas + PDV padrão). lojas_permitidas vazio = todas.
  const lojasPermitidas = (fd.getAll('lojas_permitidas') as string[]).filter(Boolean)
  const tabelasPermitidas = (fd.getAll('tabelas_permitidas') as string[]).filter(Boolean)
  const pdvLojaId    = (fd.get('pdv_loja_id') as string) || null
  const pdvDepositoId = (fd.get('pdv_deposito_id') as string) || null
  // Restrição de acesso (checkbox lido com getAll — hidden+get() pegaria errado)
  const horaInicio = (fd.get('acesso_hora_inicio') as string) || null
  const horaFim    = (fd.get('acesso_hora_fim') as string) || null
  const bloqSabado  = fd.getAll('acesso_bloqueia_sabado').includes('1')
  const bloqDomingo = fd.getAll('acesso_bloqueia_domingo').includes('1')
  const bloqFeriado = fd.getAll('acesso_bloqueia_feriado').includes('1')
  const metaRaw = parseFloat((fd.get('meta_venda_mensal') as string) || '0')
  const metaVendaMensal = isNaN(metaRaw) ? 0 : metaRaw

  const supabase = await createServiceClient()
  const { error } = await supabase.from('perfis').update({
    nome,
    permissoes: isMaster ? TODAS_KEYS : perms,
    is_master: isMaster,
    ativo,
    cargo_id: (fd.get('cargo_id') as string) || null,
    lojas_permitidas: lojasPermitidas,
    tabelas_permitidas: tabelasPermitidas,
    pdv_loja_id: pdvLojaId,
    pdv_deposito_id: pdvDepositoId,
    acesso_hora_inicio: horaInicio,
    acesso_hora_fim: horaFim,
    acesso_bloqueia_sabado: bloqSabado,
    acesso_bloqueia_domingo: bloqDomingo,
    acesso_bloqueia_feriado: bloqFeriado,
    meta_venda_mensal: metaVendaMensal,
  }).eq('id', userId)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/painel/usuarios')
  return { ok: true, message: 'Perfil atualizado' }
}

export async function alterarSenha(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  try { await requirePermissao('usuarios', token) } catch { return { ok: false, message: 'Não autorizado' } }

  const userId = fd.get('user_id') as string
  const senha  = (fd.get('senha') as string ?? '').trim()

  if (!userId || !senha) return { ok: false, message: 'Dados inválidos' }
  if (senha.length < 4) return { ok: false, message: 'Senha deve ter ao menos 4 caracteres' }

  const supabase = await createServiceClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: senha })

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Senha alterada com sucesso' }
}
