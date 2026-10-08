'use server'

import { createServiceClient, requireAuth, requirePermissao, permissoesEfetivas } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// RH lança uma entrada no banco de horas (+ adiciona / - retira)
export async function lancarHora(formData: FormData) {
  const user = await requireAuth()
  await requirePermissao('rh')
  const s = await createServiceClient()
  const hh = Number(formData.get('horas') || 0) || 0
  const mm = Number(formData.get('minutos') || 0) || 0
  const horasNum = hh + mm / 60
  const retirar = formData.get('operacao') === 'retirar'
  const horas = retirar ? -Math.abs(horasNum) : Math.abs(horasNum)
  const usuario_id = formData.get('usuario_id') as string
  if (!usuario_id || !horasNum) redirect('/painel/rh?erro=Preencha pessoa e horas')
  await s.from('banco_horas').insert({
    usuario_id,
    horas,
    data: (formData.get('data') as string) || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    motivo: (formData.get('motivo') as string) || null,
    obs: (formData.get('obs') as string) || null,
    criado_por: user.id,
  })
  revalidatePath('/painel/rh')
  revalidatePath('/painel/meu-perfil')
  redirect('/painel/rh?ok=1')
}

export async function excluirHora(id: string) {
  await requirePermissao('rh')
  const s = await createServiceClient()
  await s.from('banco_horas').delete().eq('id', id)
  revalidatePath('/painel/rh')
}

// Confirma uma dobra (folga/feriado) lançada automaticamente pelo ponto.
export async function confirmarDobra(id: string) {
  await requirePermissao('rh')
  const s = await createServiceClient()
  await s.from('banco_horas').update({ confirmado: true }).eq('id', id)
  revalidatePath('/painel/rh')
}

// ── Ajuste de ponto (só master) ────────────────────────────────────────────
// Alguém marcou o ponto errado (hora ou tipo) — o master corrige sem mexer no banco na mão.
const TIPOS_PONTO = ['entrada', 'pausa', 'retorno', 'saida']

async function requireMaster() {
  const usuario = await requireAuth()
  const { isMaster } = await permissoesEfetivas(usuario.id)
  if (!isMaster) throw new Error('Somente o master pode ajustar o ponto.')
  return usuario
}

// 'HH:MM' → criado_em de HOJE no fuso de São Paulo (timestamptz). null se inválida.
function pontoDeHoje(hora: string): string | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(hora)
  if (!m) return null
  const hh = Number(m[1]), mm = Number(m[2])
  if (hh > 23 || mm > 59) return null
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return `${hoje}T${m[1]}:${m[2]}:00-03:00`
}

export async function ajustarPonto(formData: FormData) {
  await requireMaster()
  const s = await createServiceClient()
  const ponto_id = formData.get('ponto_id') as string
  const tipo = formData.get('tipo') as string
  const criado_em = pontoDeHoje((formData.get('hora') as string) || '')
  if (!ponto_id || !TIPOS_PONTO.includes(tipo) || !criado_em) throw new Error('Dados inválidos.')
  await s.from('pontos').update({ tipo, criado_em }).eq('id', ponto_id)
  revalidatePath('/painel/rh')
}

export async function excluirPonto(ponto_id: string) {
  await requireMaster()
  const s = await createServiceClient()
  await s.from('pontos').delete().eq('id', ponto_id)
  revalidatePath('/painel/rh')
}

export async function incluirPonto(formData: FormData) {
  await requireMaster()
  const s = await createServiceClient()
  const usuario_id = formData.get('usuario_id') as string
  const tipo = formData.get('tipo') as string
  const criado_em = pontoDeHoje((formData.get('hora') as string) || '')
  if (!usuario_id || !TIPOS_PONTO.includes(tipo) || !criado_em) throw new Error('Dados inválidos.')
  await s.from('pontos').insert({ usuario_id, tipo, criado_em })
  revalidatePath('/painel/rh')
}
