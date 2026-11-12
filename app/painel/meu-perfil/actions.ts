'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { semanaDe, turnosDoDia, trabalhadoDoDia, type Escala, type Excecao, type Ponto as PontoEscala } from '@/lib/escala'
import { diaFolgaFeriado } from '@/lib/ponto-do-dia'
import { baterPontoTipo } from '@/app/painel/ponto/actions'
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

export async function atualizarMeuPin(token: string, pin: string): Promise<Res> {
  const user = await requireAuth(token)
  const p = (pin ?? '').trim()
  if (!/^[0-9]{4}$/.test(p)) return { ok: false, message: 'O PIN precisa ter 4 dígitos.' }
  const s = await createServiceClient()
  const { error } = await s.from('perfis').update({ pin_ponto: p }).eq('id', user.id)
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'PIN atualizado' }
}

export type Ponto = { id: string; tipo: string; criado_em: string }

// Hoje é folga/feriado? (pro Meu Perfil avisar na hora de bater a entrada)
export async function verificarDiaFolga(token: string): Promise<{ folga: boolean; feriado: boolean }> {
  const user = await requireAuth(token)
  const s = await createServiceClient()
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return diaFolgaFeriado(s, user.id, hoje)
}

// Registra uma batida de ponto (entrada/pausa/retorno/saida) do usuário logado.
// A regra mora em UM lugar (`baterPontoTipo`, usado também pelo widget do painel):
// valida a sequência, trava clique duplo e, na saída, fecha o banco do dia.
export async function baterPonto(token: string, tipo: string, pin?: string): Promise<{ ok: boolean; message?: string; saiu?: boolean }> {
  await requireAuth(token)
  const r = await baterPontoTipo(tipo, pin)
  if (!r.ok) return { ok: false, message: r.erro }
  return { ok: true, saiu: r.saiu }
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
    .eq('confirmado', true)
    .order('data', { ascending: false })
  const itens = (data ?? []) as BancoHora[]
  const saldo = itens.reduce((acc, i) => acc + Number(i.horas), 0)
  return { saldo, itens }
}

// Saldo de horas (trabalhado − escalado) do usuário logado: hoje e na semana.
export async function buscarMeuSaldo(token: string): Promise<{ hoje: number; semana: number }> {
  const user = await requireAuth(token)
  const s = await createServiceClient()
  const dias = semanaDe()
  const primeiro = dias[0].data
  const ultimo = dias[dias.length - 1].data

  const [{ data: esc }, { data: pts }, { data: exc }] = await Promise.all([
    s.from('escalas').select('*').eq('perfil_id', user.id).eq('ativo', true),
    s.from('pontos').select('usuario_id, tipo, criado_em').eq('usuario_id', user.id).gte('criado_em', primeiro + 'T00:00:00-03:00').lte('criado_em', ultimo + 'T23:59:59-03:00').order('criado_em'),
    s.from('escala_excecoes').select('*').eq('perfil_id', user.id).gte('data', primeiro).lte('data', ultimo),
  ])
  const escalas = (esc ?? []) as Escala[]
  const pontos = (pts ?? []) as PontoEscala[]
  const excecoes = (exc ?? []) as Excecao[]

  const hojeBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const nomes: Record<string, string> = { [user.id]: user.email ?? '' }

  let semana = 0
  let hoje = 0
  for (const d of dias) {
    const turno = turnosDoDia(d.data, d.diaSemana, escalas, excecoes, nomes).find((t) => t.perfilId === user.id)
    const planejado = turno && !turno.folga ? (turno.saida - turno.entrada - (turno.pausaIni !== null && turno.pausaFim !== null ? Math.max(0, turno.pausaFim - turno.pausaIni) : 0)) : 0
    const meu = trabalhadoDoDia(pontos, d.data).find((t) => t.perfilId === user.id)
    const saldoDia = (meu?.minutos ?? 0) - planejado
    semana += saldoDia
    if (d.data === hojeBR) hoje = saldoDia
  }
  return { hoje, semana }
}

export type MinhaEscala = { dia: number; entrada: string; saida: string; pausa_inicio: string | null; pausa_fim: string | null }

// Grade de horário (escala) do usuário logado — pra mostrar no Meu Perfil.
export async function buscarMinhaEscala(token: string): Promise<MinhaEscala[]> {
  const user = await requireAuth(token)
  const s = await createServiceClient()
  const { data } = await s.from('escalas')
    .select('dia, entrada, saida, pausa_inicio, pausa_fim')
    .eq('perfil_id', user.id).eq('ativo', true).order('dia')
  return (data ?? []) as MinhaEscala[]
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
