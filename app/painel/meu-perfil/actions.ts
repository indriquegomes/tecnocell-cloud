'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

export type Res = { ok: true; message: string } | { ok: false; message: string }

export async function buscarMeuPerfil(token: string): Promise<{ nome: string; email: string | null; cargo: string | null }> {
  const user = await requireAuth(token)
  const s = await createServiceClient()
  const { data } = await s.from('perfis').select('nome, cargo').eq('id', user.id).maybeSingle()
  return { nome: data?.nome ?? '', email: user.email, cargo: data?.cargo ?? null }
}

export async function atualizarMeuNome(token: string, nome: string): Promise<Res> {
  const user = await requireAuth(token)
  const n = nome.trim()
  if (!n) return { ok: false, message: 'Informe o nome' }
  const s = await createServiceClient()
  const { error } = await s.from('perfis').update({ nome: n }).eq('id', user.id)
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Nome atualizado' }
}

export async function alterarMinhaSenha(token: string, senhaAtual: string, senhaNova: string): Promise<Res> {
  const user = await requireAuth(token)
  if (senhaNova.trim().length < 4) return { ok: false, message: 'A nova senha deve ter ao menos 4 caracteres' }
  if (!user.email) return { ok: false, message: 'Conta sem e-mail cadastrado' }

  // Confere a senha atual antes de trocar (evita troca por sessão esquecida aberta)
  const anon = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return [] }, setAll() {} } },
  )
  const { error: errLogin } = await anon.auth.signInWithPassword({ email: user.email, password: senhaAtual })
  if (errLogin) return { ok: false, message: 'Senha atual incorreta' }

  const s = await createServiceClient()
  const { error } = await s.auth.admin.updateUserById(user.id, { password: senhaNova.trim() })
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Senha alterada com sucesso' }
}
