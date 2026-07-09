'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'

export type Res = { ok: true; message: string } | { ok: false; message: string }

export async function buscarMeuPerfil(token: string): Promise<{ nome: string; email: string | null; cargo: string | null; avatarUrl: string | null }> {
  const user = await requireAuth(token)
  const s = await createServiceClient()
  // tolerante: se a coluna avatar_url ainda não existir, cai no select sem ela
  let data: { nome?: string | null; cargo?: string | null; avatar_url?: string | null } | null = null
  const comAvatar = await s.from('perfis').select('nome, cargo, avatar_url').eq('id', user.id).maybeSingle()
  if (comAvatar.error) {
    const semAvatar = await s.from('perfis').select('nome, cargo').eq('id', user.id).maybeSingle()
    data = semAvatar.data
  } else {
    data = comAvatar.data
  }
  return { nome: data?.nome ?? '', email: user.email, cargo: data?.cargo ?? null, avatarUrl: data?.avatar_url ?? null }
}

// Upload da foto de perfil pro storage (bucket 'produtos', prefixo avatars/) e
// salva a URL em perfis.avatar_url. Requer a coluna avatar_url (migração).
export async function atualizarMinhaFoto(token: string, formData: FormData): Promise<Res> {
  const user = await requireAuth(token)
  const file = formData.get('imagem') as File | null
  if (!file || file.size === 0) return { ok: false, message: 'Selecione uma imagem' }
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: 'Imagem acima de 5MB' }
  const s = await createServiceClient()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `avatars/${user.id}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const up = await s.storage.from('produtos').upload(path, buffer, { contentType: file.type, upsert: true })
  if (up.error) return { ok: false, message: 'Falha no upload da imagem' }
  const { data } = s.storage.from('produtos').getPublicUrl(path)
  const url = `${data.publicUrl}?v=${Date.now()}` // cache-buster pra foto nova aparecer na hora
  const { error } = await s.from('perfis').update({ avatar_url: url }).eq('id', user.id)
  if (error) return { ok: false, message: 'Foto enviada, mas falta a coluna avatar_url (rode a migração)' }
  return { ok: true, message: 'Foto atualizada' }
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
