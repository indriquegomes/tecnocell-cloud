'use server'

import { createServiceClient, requireAuth, requirePermissao, permissoesEfetivas } from '@/lib/supabase/server'
import { recalcularBancoDia, horasEscaladasDia } from '@/lib/banco-horas'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// '1:35' | '1h35' | '1,35' | '2' -> horas decimais (1.5833). NaN se inválido.
function parseHoras(s: string): number {
  const t = (s || '').trim().toLowerCase().replace(/[.,]/g, ':').replace('h', ':')
  const [hhStr, mmStr] = t.split(':')
  const hh = Number(hhStr)
  if (!Number.isFinite(hh) || hh < 0) return NaN
  if (mmStr === undefined || mmStr === '') return hh
  const mm = Number(mmStr)
  if (!Number.isFinite(mm) || mm < 0 || mm > 59) return NaN
  return hh + mm / 60
}

// RH lança uma entrada no banco de horas (+ adiciona / - retira)
export async function lancarHora(formData: FormData) {
  const user = await requireAuth()
  await requirePermissao('master')
  const s = await createServiceClient()
  const horasNum = parseHoras((formData.get('horas') as string) || '')
  const retirar = formData.get('operacao') === 'retirar'
  const horas = retirar ? -Math.abs(horasNum) : Math.abs(horasNum)
  const usuario_id = formData.get('usuario_id') as string
  if (!usuario_id || !horasNum) redirect('/painel/rh?erro=' + encodeURIComponent('Preencha pessoa e horas no formato hora:minuto (ex: 1:35)'))
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
  await requirePermissao('master')
  const s = await createServiceClient()
  await s.from('banco_horas').delete().eq('id', id)
  revalidatePath('/painel/rh')
}

// Confirma uma dobra (folga/feriado) lançada automaticamente pelo ponto.
export async function confirmarDobra(id: string) {
  await requirePermissao('master')
  const s = await createServiceClient()
  await s.from('banco_horas').update({ confirmado: true }).eq('id', id)
  revalidatePath('/painel/rh')
}

// Abona uma falta (justificada): zera as horas e marca 'abono'. NÃO apaga — senão o
// detector de faltas recriava no próximo load (era o "justificar travado"). O 'abono'
// some do desconto (horas 0) e o detector pula quem já tem abono no dia (lib/faltas.ts).
export async function abonarFalta(id: string) {
  await requirePermissao('master')
  const s = await createServiceClient()
  // .eq('motivo','falta') protege de abonar algo que já não é falta. Se o update falhar,
  // mostra o erro (não some em silêncio — senão a falta "voltava" sem pista nenhuma).
  const { error } = await s.from('banco_horas')
    .update({ horas: 0, motivo: 'abono', obs: 'Abonada (justificada)', confirmado: true })
    .eq('id', id)
    .eq('motivo', 'falta')
  if (error) redirect('/painel/rh?erro=' + encodeURIComponent('Não deu pra abonar: ' + error.message))
  revalidatePath('/painel/rh')
  revalidatePath('/painel/meu-perfil')
}

// Confirma a falta: o desconto passa a valer (confirmado=true).
export async function confirmarFalta(id: string) {
  await requirePermissao('master')
  const s = await createServiceClient()
  const { error } = await s.from('banco_horas').update({ confirmado: true }).eq('id', id).eq('motivo', 'falta')
  if (error) redirect('/painel/rh?erro=' + encodeURIComponent('Não deu pra confirmar o desconto: ' + error.message))
  revalidatePath('/painel/rh')
  revalidatePath('/painel/meu-perfil')
}

// Desfaz um abono: volta a falta pra pendente (confirmado=false) com as horas da escala.
// Recompõe as horas pela escala (não depende da janela de 7 dias do detector). Se não
// há escala no dia (nunca foi falta devida), só apaga o abono.
export async function desfazerAbono(id: string) {
  await requirePermissao('master')
  const s = await createServiceClient()
  const { data: abono } = await s.from('banco_horas').select('usuario_id, data').eq('id', id).eq('motivo', 'abono').maybeSingle()
  if (!abono) redirect('/painel/rh?erro=' + encodeURIComponent('Abono não encontrado.'))
  const h = await horasEscaladasDia(s, abono.usuario_id, abono.data)
  if (h == null) {
    await s.from('banco_horas').delete().eq('id', id)
  } else {
    await s.from('banco_horas').update({ motivo: 'falta', horas: -h, obs: 'Falta (não bateu ponto)', confirmado: false }).eq('id', id)
  }
  revalidatePath('/painel/rh')
  revalidatePath('/painel/meu-perfil')
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

// data (YYYY-MM-DD) no fuso de São Paulo de um criado_em (timestamptz)
function dataDeCriadoEm(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export async function ajustarPonto(formData: FormData) {
  await requireMaster()
  const s = await createServiceClient()
  const ponto_id = formData.get('ponto_id') as string
  const tipo = formData.get('tipo') as string
  const criado_em = pontoDeHoje((formData.get('hora') as string) || '')
  if (!ponto_id || !TIPOS_PONTO.includes(tipo) || !criado_em) throw new Error('Dados inválidos.')
  const { data: antes } = await s.from('pontos').select('usuario_id, criado_em').eq('id', ponto_id).maybeSingle()
  await s.from('pontos').update({ tipo, criado_em }).eq('id', ponto_id)
  // regra fundamental: ajuste de ponto RECALCULA o banco (mesma lógica da saída)
  const uid = (antes as { usuario_id?: string | null } | null)?.usuario_id
  if (uid) {
    const dataOriginal = (antes as { criado_em?: string | null } | null)?.criado_em ? dataDeCriadoEm((antes as { criado_em: string }).criado_em) : null
    if (dataOriginal) await recalcularBancoDia(s, uid, dataOriginal)
    await recalcularBancoDia(s, uid, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
  }
  revalidatePath('/painel/rh')
  revalidatePath('/painel/meu-perfil')
}

export async function excluirPonto(ponto_id: string) {
  await requireMaster()
  const s = await createServiceClient()
  const { data: antes } = await s.from('pontos').select('usuario_id, criado_em').eq('id', ponto_id).maybeSingle()
  await s.from('pontos').delete().eq('id', ponto_id)
  const uid = (antes as { usuario_id?: string | null } | null)?.usuario_id
  if (uid) {
    const data = (antes as { criado_em?: string | null } | null)?.criado_em ? dataDeCriadoEm((antes as { criado_em: string }).criado_em) : null
    if (data) await recalcularBancoDia(s, uid, data)
  }
  revalidatePath('/painel/rh')
  revalidatePath('/painel/meu-perfil')
}

export async function incluirPonto(formData: FormData) {
  await requireMaster()
  const s = await createServiceClient()
  const usuario_id = formData.get('usuario_id') as string
  const tipo = formData.get('tipo') as string
  const criado_em = pontoDeHoje((formData.get('hora') as string) || '')
  if (!usuario_id || !TIPOS_PONTO.includes(tipo) || !criado_em) throw new Error('Dados inválidos.')
  await s.from('pontos').insert({ usuario_id, tipo, criado_em })
  await recalcularBancoDia(s, usuario_id, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
  revalidatePath('/painel/rh')
  revalidatePath('/painel/meu-perfil')
}
