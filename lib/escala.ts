// ESCALA DE HORÁRIOS.
//
// A loja abre 08:00 e fecha 19:00 (sábado 17:00). Domingo não abre.
//
// A escala é a ROTINA (a Duda entra 08h toda segunda). Como ela varia, existem
// ALTERAÇÕES: um dia específico sobrescreve a rotina (folga, ou entrar mais tarde).
//
// O que o Vitor quer enxergar: o FURO — loja aberta e ninguém escalado. Mínimo é
// UMA pessoa; com uma já está coberto.

export const HORARIO_LOJA = {
  semana: { abre: '08:00', fecha: '19:00' },   // seg a sex
  sabado: { abre: '08:00', fecha: '17:00' },
} as const

export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export interface Escala {
  id: string
  perfil_id: string
  dia: number         // 0=dom … 6=sáb
  entrada: string     // "08:00:00"
  saida: string
  ativo: boolean
}

export interface Excecao {
  id: string
  perfil_id: string
  data: string        // "2026-07-20"
  folga: boolean
  entrada: string | null
  saida: string | null
  motivo: string | null
}

/** Turno de UMA pessoa num dia concreto, já com a alteração aplicada. */
export interface Turno {
  perfilId: string
  nome: string
  entrada: number     // minutos do dia
  saida: number
  folga: boolean
  motivo: string | null
  alterado: boolean   // veio de exceção, não da rotina
}

export const min = (hhmm: string | null | undefined): number => {
  if (!hhmm) return 0
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export const hhmm = (minutos: number): string => {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function horarioDoDia(diaSemana: number) {
  if (diaSemana === 0) return null                      // domingo: fechado
  return diaSemana === 6 ? HORARIO_LOJA.sabado : HORARIO_LOJA.semana
}

/** Os turnos de um DIA concreto: rotina + alterações daquela data. */
export function turnosDoDia(
  data: string,                       // "2026-07-20"
  diaSemana: number,
  escalas: Escala[],
  excecoes: Excecao[],
  nomes: Record<string, string>,
): Turno[] {
  const doDia = excecoes.filter((e) => e.data === data)
  const porPessoa = new Map<string, Excecao>()
  for (const e of doDia) porPessoa.set(e.perfil_id, e)

  const turnos: Turno[] = []

  for (const es of escalas.filter((e) => e.ativo && e.dia === diaSemana)) {
    const ex = porPessoa.get(es.perfil_id)
    if (ex?.folga) {
      turnos.push({ perfilId: es.perfil_id, nome: nomes[es.perfil_id] ?? '—', entrada: 0, saida: 0, folga: true, motivo: ex.motivo, alterado: true })
      continue
    }
    turnos.push({
      perfilId: es.perfil_id,
      nome: nomes[es.perfil_id] ?? '—',
      entrada: min(ex?.entrada ?? es.entrada),
      saida: min(ex?.saida ?? es.saida),
      folga: false,
      motivo: ex?.motivo ?? null,
      alterado: !!ex,
    })
  }

  // Alteração de quem NÃO tem rotina nesse dia (ex: chamaram a Mari num sábado que
  // ela normalmente não trabalha). Sem isso, ela cobriria a loja e o sistema não veria.
  for (const ex of doDia) {
    if (turnos.some((t) => t.perfilId === ex.perfil_id)) continue
    if (ex.folga || !ex.entrada || !ex.saida) continue
    turnos.push({
      perfilId: ex.perfil_id,
      nome: nomes[ex.perfil_id] ?? '—',
      entrada: min(ex.entrada),
      saida: min(ex.saida),
      folga: false,
      motivo: ex.motivo,
      alterado: true,
    })
  }

  return turnos.sort((a, b) => a.entrada - b.entrada)
}

/**
 * FUROS: pedaços do expediente em que NINGUÉM está escalado.
 * Varre minuto a minuto o horário da loja e junta os vazios em blocos.
 */
export function furosDoDia(turnos: Turno[], diaSemana: number): { de: number; ate: number }[] {
  const h = horarioDoDia(diaSemana)
  if (!h) return []                                  // domingo não conta

  const abre = min(h.abre)
  const fecha = min(h.fecha)
  const ativos = turnos.filter((t) => !t.folga && t.saida > t.entrada)

  const cobre = (m: number) => ativos.some((t) => t.entrada <= m && m < t.saida)

  const furos: { de: number; ate: number }[] = []
  let inicio: number | null = null
  for (let m = abre; m < fecha; m++) {
    if (!cobre(m)) {
      if (inicio === null) inicio = m
    } else if (inicio !== null) {
      furos.push({ de: inicio, ate: m })
      inicio = null
    }
  }
  if (inicio !== null) furos.push({ de: inicio, ate: fecha })

  // ignora frestas de 1-2 min (arredondamento de horário não é furo de verdade)
  return furos.filter((f) => f.ate - f.de >= 5)
}

/** Horas de cada pessoa no período (já sem as folgas). */
export function horasPorPessoa(
  dias: { data: string; diaSemana: number }[],
  escalas: Escala[],
  excecoes: Excecao[],
  nomes: Record<string, string>,
): { perfilId: string; nome: string; minutos: number; dias: number }[] {
  const acc: Record<string, { minutos: number; dias: number }> = {}

  for (const d of dias) {
    for (const t of turnosDoDia(d.data, d.diaSemana, escalas, excecoes, nomes)) {
      if (t.folga || t.saida <= t.entrada) continue
      acc[t.perfilId] ??= { minutos: 0, dias: 0 }
      acc[t.perfilId].minutos += t.saida - t.entrada
      acc[t.perfilId].dias += 1
    }
  }

  return Object.entries(acc)
    .map(([perfilId, v]) => ({ perfilId, nome: nomes[perfilId] ?? '—', ...v }))
    .sort((a, b) => b.minutos - a.minutos)
}

export const horasTexto = (minutos: number) => {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** Segunda-feira da semana que contém a data (a grade é semanal). */
export function semanaDe(base: Date = new Date()): { data: string; diaSemana: number }[] {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(base)) p[x.type] = x.value
  const hojeDia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)

  const inicio = new Date(`${p.year}-${p.month}-${p.day}T12:00:00-03:00`)
  inicio.setDate(inicio.getDate() - ((hojeDia + 6) % 7))   // volta pra segunda

  const out: { data: string; diaSemana: number }[] = []
  for (let i = 0; i < 6; i++) {                              // seg → sáb (domingo fechado)
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    out.push({
      data: d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
      diaSemana: ((i + 1) % 7),
    })
  }
  return out
}
