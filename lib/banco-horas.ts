import type { createServiceClient } from '@/lib/supabase/server'
import { turnosDoDia, trabalhadoDoDia, type Escala, type Excecao, type Ponto as PontoEscala } from '@/lib/escala'
import { ehFeriado } from '@/lib/feriados'

type SB = Awaited<ReturnType<typeof createServiceClient>>

// Recalcula o banco de horas de UM dia (hora extra / atraso) e devolve o que mudou.
// Regra fundamental: trabalhado − escalado. Roda na batida de SAÍDA (Meu Perfil) E no
// ajuste de ponto do master (RH) — mesma regra nos dois, pra edição manual nunca ficar
// acima da lógica. Só mexe nos lançamentos AUTOMÁTICOS (hora_extra/atraso); lançamento
// manual (solicitacao_loja, cobrir_colega, pagamento...) fica intacto.
export async function recalcularBancoDia(
  s: SB,
  userId: string,
  data: string,
): Promise<{ horas: number; motivo: 'hora_extra' | 'atraso' } | null> {
  // remove o automático antigo do dia (idempotente: recálculo não duplica)
  await s.from('banco_horas').delete().eq('usuario_id', userId).eq('data', data).in('motivo', ['hora_extra', 'atraso'])

  // folga/feriado: sem extra nem atraso (a dobra cobre)
  if (await ehFeriado(userId, data)) return null
  const diaSemana = new Date(data + 'T12:00:00-03:00').getDay()
  const [{ data: esc }, { data: exc }, { data: pts }] = await Promise.all([
    s.from('escalas').select('*').eq('perfil_id', userId).eq('ativo', true),
    s.from('escala_excecoes').select('*').eq('perfil_id', userId).eq('data', data),
    s.from('pontos').select('tipo, criado_em, usuario_id').eq('usuario_id', userId).gte('criado_em', data + 'T00:00:00-03:00').lte('criado_em', data + 'T23:59:59-03:00').order('criado_em'),
  ])
  const turno = turnosDoDia(data, diaSemana, (esc ?? []) as Escala[], (exc ?? []) as Excecao[], { [userId]: '' }).find((t) => t.perfilId === userId)
  if (!turno || turno.folga) return null
  const planejado = turno.saida - turno.entrada - (turno.pausaIni !== null && turno.pausaFim !== null ? Math.max(0, turno.pausaFim - turno.pausaIni) : 0)
  const trabalhado = trabalhadoDoDia((pts ?? []) as PontoEscala[], data).find((t) => t.perfilId === userId)?.minutos ?? 0
  const extra = trabalhado - planejado
  if (extra === 0) return null

  const horas = Math.round((extra / 60) * 100) / 100
  const motivo: 'hora_extra' | 'atraso' = extra > 0 ? 'hora_extra' : 'atraso'
  await s.from('banco_horas').insert({
    usuario_id: userId,
    horas,
    data,
    motivo,
    obs: extra > 0 ? 'Trabalhou além da escala' : 'Trabalhou menos que a escala',
    confirmado: true,
  })
  return { horas, motivo }
}

// Horas planejadas (escala) de um dia pra um usuário, em horas decimais.
// null se não tem escala naquele dia, é folga, ou o planejado é <= 0. Usado pelo
// "desfazer abono" pra recompor a falta com as horas certas (sem depender da
// janela de 7 dias do detector).
export async function horasEscaladasDia(s: SB, userId: string, data: string): Promise<number | null> {
  const diaSemana = new Date(data + 'T12:00:00-03:00').getDay()
  const [{ data: esc }, { data: exc }] = await Promise.all([
    s.from('escalas').select('*').eq('perfil_id', userId).eq('ativo', true),
    s.from('escala_excecoes').select('*').eq('perfil_id', userId).eq('data', data),
  ])
  const turno = turnosDoDia(data, diaSemana, (esc ?? []) as Escala[], (exc ?? []) as Excecao[], { [userId]: '' }).find((t) => t.perfilId === userId)
  if (!turno || turno.folga) return null
  const planejado = turno.saida - turno.entrada - (turno.pausaIni !== null && turno.pausaFim !== null ? Math.max(0, turno.pausaFim - turno.pausaIni) : 0)
  if (planejado <= 0) return null
  return Math.round((planejado / 60) * 100) / 100
}
