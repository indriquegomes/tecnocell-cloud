'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

const MODULOS = [
  'pdv', 'estoque', 'pessoas', 'financeiro',
  'relatorios', 'promocoes', 'vales', 'pedidos', 'configuracoes',
]

export { MODULOS }

export async function criarUsuario(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  try { await requireAuth(token) } catch { return { ok: false, message: 'Não autorizado' } }

  const email    = (fd.get('email') as string ?? '').trim()
  const senha    = (fd.get('senha') as string ?? '').trim()
  const nome     = (fd.get('nome') as string ?? '').trim()
  const cargo    = (fd.get('cargo') as string ?? 'vendedor') as 'dono' | 'gerente' | 'vendedor'
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
    cargo,
    permissoes: cargo === 'dono' ? MODULOS : perms,
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
  try { await requireAuth(token) } catch { return { ok: false, message: 'Não autorizado' } }

  const userId = fd.get('user_id') as string
  const nome   = (fd.get('nome') as string ?? '').trim()
  const cargo  = (fd.get('cargo') as string ?? 'vendedor') as 'dono' | 'gerente' | 'vendedor'
  const perms  = fd.getAll('permissoes') as string[]
  const ativo  = fd.get('ativo') === '1'

  if (!userId || !nome) return { ok: false, message: 'Dados inválidos' }

  const supabase = await createServiceClient()
  const { error } = await supabase.from('perfis').update({
    nome,
    cargo,
    permissoes: cargo === 'dono' ? MODULOS : perms,
    ativo,
    updated_at: new Date().toISOString(),
  }).eq('id', userId)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/painel/usuarios')
  return { ok: true, message: 'Perfil atualizado' }
}

export async function alterarSenha(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const token = fd.get('access_token') as string
  try { await requireAuth(token) } catch { return { ok: false, message: 'Não autorizado' } }

  const userId = fd.get('user_id') as string
  const senha  = (fd.get('senha') as string ?? '').trim()

  if (!userId || !senha) return { ok: false, message: 'Dados inválidos' }
  if (senha.length < 4) return { ok: false, message: 'Senha deve ter ao menos 4 caracteres' }

  const supabase = await createServiceClient()
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: senha })

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Senha alterada com sucesso' }
}
