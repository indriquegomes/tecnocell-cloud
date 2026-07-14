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
  pausa_inicio?: string | null   // almoço/lanche — durante a pausa a pessoa NÃO cobre a loja
  pausa_fim?: string | null
  ativo: boolean
}

export interface Excecao {
  id: string
  perfil_id: string
  data: string        // "2026-07-20"
  folga: boolean
  entrada: string | null
  saida: string | null
  pausa_inicio?: string | null
  pausa_fim?: string | null
  motivo: string | null
}

/** Turno de UMA pessoa num dia concreto, já com a alteração aplicada. */
export interface Turno {
  perfilId: string
  nome: string
  entrada: number     // minutos do dia
  saida: number
  pausaIni: number | null   // almoço/lanche (minutos) — não cobre a loja nesse trecho
  pausaFim: number | null
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

// A RÉGUA vai de 00:00 a 24:00 (pedido do Vitor: "não contar somente quando a loja
// está aberta, mas o dia todo"). Sem isto não dava pra escalar quem chega 06h pra
// abrir, ou quem fica depois das 19h fechando o caixa — a régua parava no horário
// comercial. O FURO continua sendo só dentro do expediente: loja fechada não tem furo.
export const DIA_INICIO = 0          // 00:00
export const DIA_FIM = 24 * 60       // 24:00

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
      turnos.push({ perfilId: es.perfil_id, nome: nomes[es.perfil_id] ?? '—', entrada: 0, saida: 0, pausaIni: null, pausaFim: null, folga: true, motivo: ex.motivo, alterado: true })
      continue
    }
    const pIni = ex ? (ex.pausa_inicio ?? null) : (es.pausa_inicio ?? null)
    const pFim = ex ? (ex.pausa_fim ?? null) : (es.pausa_fim ?? null)
    turnos.push({
      perfilId: es.perfil_id,
      nome: nomes[es.perfil_id] ?? '—',
      entrada: min(ex?.entrada ?? es.entrada),
      saida: min(ex?.saida ?? es.saida),
      pausaIni: pIni ? min(pIni) : null,
      pausaFim: pFim ? min(pFim) : null,
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
      pausaIni: ex.pausa_inicio ? min(ex.pausa_inicio) : null,
      pausaFim: ex.pausa_fim ? min(ex.pausa_fim) : null,
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

  const cobre = (m: number) => ativos.some((t) =>
    t.entrada <= m && m < t.saida &&
    !(t.pausaIni !== null && t.pausaFim !== null && t.pausaIni <= m && m < t.pausaFim))

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

// ── PONTO: o que REALMENTE aconteceu ────────────────────────────────────────
//
// A escala é o PLANO. O ponto é o REAL. A Bruna aperta "Pausa" quando vai lanchar
// (10 minutinhos) e "Retornar" quando volta — e isso vira uma barra ao lado da barra
// planejada, na mesma linha do tempo.
//
// Vitor foi explícito: é pra ENXERGAR, não pra julgar. Nada de "atrasado", nada de
// limite de pausa. Só o tempo trabalhado. Se as meninas sentirem vigilância, param de
// apertar o botão — e aí o dado morre e o esforço foi jogado fora.

export interface Ponto {
  usuario_id: string
  tipo: string          // entrada | pausa | retorno | saida
  criado_em: string
}

export interface Trabalhado {
  perfilId: string
  blocos: { de: number; ate: number }[]   // minutos do dia, já sem as pausas
  minutos: number
  aberto: boolean                          // ainda está trabalhando agora
}

/** Minuto do dia (fuso da loja) de um timestamp. */
function minutoSP(iso: string): number {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const [h, m] = f.format(new Date(iso)).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Data (YYYY-MM-DD) de um timestamp, no fuso da loja. */
function dataSP(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * O que cada pessoa trabalhou DE FATO num dia: pares entrada/retorno → pausa/saída.
 * Um bloco aberto (entrou e ainda não saiu) vai até agora.
 */
export function trabalhadoDoDia(pontos: Ponto[], data: string, agora = new Date()): Trabalhado[] {
  const doDia = pontos
    .filter((p) => dataSP(p.criado_em) === data)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))

  const porPessoa: Record<string, Ponto[]> = {}
  for (const p of doDia) (porPessoa[p.usuario_id] ??= []).push(p)

  const hojeSP = dataSP(agora.toISOString())
  const agoraMin = minutoSP(agora.toISOString())

  return Object.entries(porPessoa).map(([perfilId, ps]) => {
    const blocos: { de: number; ate: number }[] = []
    let inicio: number | null = null

    for (const p of ps) {
      const m = minutoSP(p.criado_em)
      if (p.tipo === 'entrada' || p.tipo === 'retorno') {
        if (inicio === null) inicio = m
      } else if (p.tipo === 'pausa' || p.tipo === 'saida') {
        if (inicio !== null && m > inicio) blocos.push({ de: inicio, ate: m })
        inicio = null
      }
    }

    // ainda trabalhando: o bloco vai até agora (só faz sentido se o dia é hoje)
    const aberto = inicio !== null
    if (aberto && data === hojeSP && agoraMin > inicio!) blocos.push({ de: inicio!, ate: agoraMin })

    return {
      perfilId,
      blocos,
      minutos: blocos.reduce((s, b) => s + (b.ate - b.de), 0),
      aberto,
    }
  })
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
      const pausa = t.pausaIni !== null && t.pausaFim !== null ? Math.max(0, t.pausaFim - t.pausaIni) : 0
      acc[t.perfilId].minutos += (t.saida - t.entrada) - pausa
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
