'use server'

import { createServiceClient } from '@/lib/supabase/server'

export async function validarConvite(token: string): Promise<{ valido: boolean; nome?: string; motivo?: string }> {
  const s = await createServiceClient()
  const { data } = await s.from('convites').select('nome, usado, expires_at').eq('token', token).maybeSingle()
  if (!data) return { valido: false, motivo: 'Convite não encontrado.' }
  if (data.usado) return { valido: false, motivo: 'Este convite já foi usado.' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { valido: false, motivo: 'Convite expirado.' }
  return { valido: true, nome: data.nome ?? undefined }
}

export async function definirSenhaConvite(token: string, senha: string): Promise<{ ok: boolean; message: string }> {
  if (senha.trim().length < 4) return { ok: false, message: 'A senha deve ter ao menos 4 caracteres.' }
  const s = await createServiceClient()
  const { data } = await s.from('convites').select('id, user_id, usado, expires_at').eq('token', token).maybeSingle()
  if (!data) return { ok: false, message: 'Convite inválido.' }
  if (data.usado) return { ok: false, message: 'Este convite já foi usado.' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { ok: false, message: 'Convite expirado.' }

  const { error } = await s.auth.admin.updateUserById(data.user_id, { password: senha.trim() })
  if (error) return { ok: false, message: error.message }

  await s.from('convites').update({ usado: true }).eq('id', data.id)
  return { ok: true, message: 'Senha definida! Você já pode entrar no sistema.' }
}
