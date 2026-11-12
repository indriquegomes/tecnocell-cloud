import { ehFeriado } from '@/lib/feriados'
import { recalcularBancoDia } from '@/lib/banco-horas'
import type { createServiceClient } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createServiceClient>>

// O que acontece DEPOIS de uma batida de ponto — uma vez, para os dois caminhos
// (painel e Meu Perfil). Antes o painel fechava o dia sem calcular nada e o Meu
// Perfil calculava; quem saía pelo painel perdia o atraso/hora extra do dia.

// Hoje é folga ou feriado pra pessoa? (escala semanal + exceção + feriados)
export async function diaFolgaFeriado(s: SB, userId: string, hoje: string): Promise<{ folga: boolean; feriado: boolean }> {
  const feriado = await ehFeriado(userId, hoje)

  const { data: exc } = await s.from('escala_excecoes').select('folga').eq('perfil_id', userId).eq('data', hoje).maybeSingle()
  if (exc) return { folga: !!exc.folga, feriado }
  // só é folga se a pessoa está numa escala semanal (tem ao menos uma linha) e hoje não tem
  const { data: temEscala } = await s.from('escalas').select('id').eq('perfil_id', userId).eq('ativo', true).limit(1)
  if (!temEscala || temEscala.length === 0) return { folga: false, feriado }
  const dia = new Date(hoje + 'T12:00:00').getDay()
  const { data: esc } = await s.from('escalas').select('id').eq('perfil_id', userId).eq('dia', dia).eq('ativo', true).limit(1)
  return { folga: !(esc && esc.length > 0), feriado }
}

// No feriado (por lei): o trabalhado do dia entra em DOBRO (×2) no banco, automático.
// Folga NÃO dobra — conta 1× e se resolve no cálculo semanal (trabalhado − escalado).
async function aplicarDobra(s: SB, userId: string, hoje: string) {
  const { feriado } = await diaFolgaFeriado(s, userId, hoje)
  if (!feriado) return
  // Estagiário não acumula hora extra nem dobrada (Lei 11.788/2008).
  const { data: pf } = await s.from('perfis').select('vinculo').eq('id', userId).maybeSingle()
  if ((pf as { vinculo?: string | null } | null)?.vinculo === 'estagio') return
  const { data: ja } = await s.from('banco_horas').select('id').eq('usuario_id', userId).eq('data', hoje).eq('motivo', 'dobra').limit(1)
  if (ja && ja.length > 0) return
  const { data: pts } = await s.from('pontos')
    .select('tipo, criado_em')
    .eq('usuario_id', userId).gte('criado_em', hoje + 'T00:00:00-03:00').order('criado_em')
  let min = 0, aberto: number | null = null
  for (const p of (pts ?? [])) {
    const t = new Date(p.criado_em).getTime()
    if (p.tipo === 'entrada' || p.tipo === 'retorno') aberto = t
    else if ((p.tipo === 'pausa' || p.tipo === 'saida') && aberto != null) { min += (t - aberto) / 60000; aberto = null }
  }
  const horas = min / 60
  if (horas <= 0) return
  const { error: errDobra } = await s.from('banco_horas').insert({ usuario_id: userId, horas: horas * 2, data: hoje, motivo: 'dobra', obs: 'Dobra (feriado)', confirmado: true })
  // 23505 = dobra já existe (2 saídas simultâneas em feriado) — não duplica.
  if (errDobra && (errDobra as { code?: string }).code !== '23505') console.error('aplicarDobra:', errDobra.message)
}

// Roda depois de uma batida de SUCESSO. Só a saída fecha o dia: aí entram a
// dobra de feriado e o recálculo do banco de horas (trabalhado − escalado).
export async function aposBatida(s: SB, userId: string, tipo: string): Promise<void> {
  if (tipo !== 'saida') return
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  await aplicarDobra(s, userId, hoje)
  await recalcularBancoDia(s, userId, hoje)
}

// Confere o PIN de ponto da pessoa. Tolerante: se a coluna pin_ponto ainda não
// existir (migration não rodou), usa '1234' — o ponto não pode parar por isso.
export async function conferirPinPonto(s: SB, userId: string, pin: string | undefined): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data: perfil, error } = await s.from('perfis').select('pin_ponto').eq('id', userId).maybeSingle()
  const pinSalvo = error ? '1234' : ((perfil as { pin_ponto?: string | null } | null)?.pin_ponto || '1234')
  if ((pin ?? '').trim() !== pinSalvo) return { ok: false, erro: 'PIN incorreto.' }
  return { ok: true }
}
