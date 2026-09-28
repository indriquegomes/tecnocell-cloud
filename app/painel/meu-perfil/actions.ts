'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import sharp from 'sharp'

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
  // comprime no servidor: quadrado 256px em WebP (~15KB) — leve pra carregar em qualquer tela.
  // .rotate() respeita a orientação EXIF (foto de celular deitada não vira de lado).
  const raw = Buffer.from(await file.arrayBuffer())
  const webp = await sharp(raw).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toBuffer()
  const path = `avatars/${user.id}.webp`
  const up = await s.storage.from('produtos').upload(path, webp, { contentType: 'image/webp', upsert: true })
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

export type Ponto = { id: string; tipo: string; criado_em: string }

// Cidade (slug) da loja da pessoa, pra bater com feriados.cidade.
async function cidadeDaLoja(s: Awaited<ReturnType<typeof createServiceClient>>, lojaId: string | null | undefined): Promise<string> {
  if (!lojaId) return ''
  const { data } = await s.from('lojas').select('nome').eq('id', lojaId).maybeSingle()
  return String((data as { nome?: string } | null)?.nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

// Hoje é folga ou feriado pra pessoa? (escala semanal + exceção + feriados)
async function diaFolgaFeriado(s: Awaited<ReturnType<typeof createServiceClient>>, userId: string, hoje: string): Promise<{ folga: boolean; feriado: boolean }> {
  const { data: perfil } = await s.from('perfis').select('pdv_loja_id').eq('id', userId).maybeSingle()
  const cidade = await cidadeDaLoja(s, (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id)
  const { data: fers } = await s.from('feriados').select('cidade').eq('data', hoje)
  const feriado = (fers ?? []).some((f) => f.cidade === 'todas' || f.cidade === cidade)

  const { data: exc } = await s.from('escala_excecoes').select('folga').eq('perfil_id', userId).eq('data', hoje).maybeSingle()
  if (exc) return { folga: !!exc.folga, feriado }
  // só é folga se a pessoa está numa escala semanal (tem ao menos uma linha) e hoje não tem
  const { data: temEscala } = await s.from('escalas').select('id').eq('perfil_id', userId).eq('ativo', true).limit(1)
  if (!temEscala || temEscala.length === 0) return { folga: false, feriado }
  const dia = new Date(hoje + 'T12:00:00').getDay()
  const { data: esc } = await s.from('escalas').select('id').eq('perfil_id', userId).eq('dia', dia).eq('ativo', true).limit(1)
  return { folga: !(esc && esc.length > 0), feriado }
}

// Na saída: se a entrada foi marcada como 'extra' (dobra), calcula o trabalhado × 2 e
// lança no banco de horas (confirmado=false, o master confirma no RH).
async function aplicarDobra(s: Awaited<ReturnType<typeof createServiceClient>>, userId: string, hoje: string) {
  const { data: pts } = await s.from('pontos')
    .select('tipo, criado_em, dobra_tipo')
    .eq('usuario_id', userId).gte('criado_em', hoje + 'T00:00:00-03:00').order('criado_em')
  const entradaExtra = (pts ?? []).find((p) => p.tipo === 'entrada' && p.dobra_tipo === 'extra')
  if (!entradaExtra) return
  const { data: ja } = await s.from('banco_horas').select('id').eq('usuario_id', userId).eq('data', hoje).eq('motivo', 'dobra').limit(1)
  if (ja && ja.length > 0) return
  let min = 0, aberto: number | null = null
  for (const p of (pts ?? [])) {
    const t = new Date(p.criado_em).getTime()
    if (p.tipo === 'entrada' || p.tipo === 'retorno') aberto = t
    else if ((p.tipo === 'pausa' || p.tipo === 'saida') && aberto != null) { min += (t - aberto) / 60000; aberto = null }
  }
  const horas = min / 60
  if (horas <= 0) return
  await s.from('banco_horas').insert({ usuario_id: userId, horas: horas * 2, data: hoje, motivo: 'dobra', obs: 'Dobra (folga/feriado)', confirmado: false })
}

// Hoje é folga/feriado? (pro Meu Perfil avisar na hora de bater a entrada)
export async function verificarDiaFolga(token: string): Promise<{ folga: boolean; feriado: boolean }> {
  const user = await requireAuth(token)
  const s = await createServiceClient()
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return diaFolgaFeriado(s, user.id, hoje)
}

// Registra uma batida de ponto (entrada/pausa/retorno/saida) do usuário logado.
// dobraTipo/dobraData só valem na ENTRADA em dia de folga/feriado ('extra' ou 'troca').
export async function baterPonto(token: string, tipo: string, dobraTipo?: string, dobraData?: string): Promise<{ ok: boolean; message?: string; ponto?: Ponto }> {
  const user = await requireAuth(token)
  if (!['entrada', 'pausa', 'retorno', 'saida'].includes(tipo)) return { ok: false, message: 'Tipo inválido' }
  const s = await createServiceClient()
  const { data: perfil } = await s.from('perfis').select('pdv_loja_id').eq('id', user.id).maybeSingle()
  const { data, error } = await s.from('pontos')
    .insert({
      usuario_id: user.id,
      tipo,
      loja_id: (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null,
      dobra_tipo: tipo === 'entrada' ? (dobraTipo || null) : null,
      dobra_data: tipo === 'entrada' && dobraTipo === 'troca' ? (dobraData || null) : null,
    })
    .select('id, tipo, criado_em').single()
  if (error) return { ok: false, message: error.message }
  if (tipo === 'saida') {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    await aplicarDobra(s, user.id, hoje)
  }
  return { ok: true, ponto: data as Ponto }
}

// Batidas de HOJE do usuário logado (fuso America/Sao_Paulo).
export async function buscarMeuPontoHoje(token: string): Promise<Ponto[]> {
  const user = await requireAuth(token)
  const s = await createServiceClient()
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) // YYYY-MM-DD
  const { data } = await s.from('pontos')
    .select('id, tipo, criado_em')
    .eq('usuario_id', user.id)
    .gte('criado_em', `${hoje}T00:00:00-03:00`)
    .order('criado_em')
  return (data ?? []) as Ponto[]
}

export type BancoHora = { id: string; horas: number; data: string; motivo: string | null; obs: string | null }

// Banco de horas do usuário logado (saldo + últimos lançamentos).
export async function buscarMeuBanco(token: string): Promise<{ saldo: number; itens: BancoHora[] }> {
  const user = await requireAuth(token)
  const s = await createServiceClient()
  const { data } = await s.from('banco_horas')
    .select('id, horas, data, motivo, obs')
    .eq('usuario_id', user.id)
    .order('data', { ascending: false })
  const itens = (data ?? []) as BancoHora[]
  const saldo = itens.reduce((acc, i) => acc + Number(i.horas), 0)
  return { saldo, itens }
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
