// Restrição de horário/dias de acesso. Tudo avaliado no fuso America/Sao_Paulo
// (o servidor roda em UTC na Vercel; nunca usar new Date() local pra decidir).

export type AcessoConfig = {
  horaInicio: string | null   // 'HH:MM'
  horaFim: string | null      // 'HH:MM'
  bloqSabado: boolean
  bloqDomingo: boolean
  bloqFeriado: boolean
}

// Componentes de "agora" no fuso de São Paulo.
export function agoraSaoPaulo(d: Date = new Date()): { hhmm: string; diaSemana: number; mes: number; dia: number; ano: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  })
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  const semana: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  let hh = p.hour === '24' ? '00' : p.hour   // Intl pode devolver 24 à meia-noite
  return {
    hhmm: `${hh}:${p.minute}`,
    diaSemana: semana[p.weekday] ?? 0,
    mes: parseInt(p.month, 10),
    dia: parseInt(p.day, 10),
    ano: parseInt(p.year, 10),
  }
}

// Domingo de Páscoa (algoritmo de Gauss/Anônimo Gregoriano) → { mes, dia }.
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19
  const b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return { mes, dia }
}

// Feriado nacional brasileiro? (fixos + móveis derivados da Páscoa).
export function ehFeriadoNacional(ano: number, mes: number, dia: number): boolean {
  const fixos = ['1-1', '4-21', '5-1', '9-7', '10-12', '11-2', '11-15', '11-20', '12-25']
  if (fixos.includes(`${mes}-${dia}`)) return true
  const pa = pascoa(ano)
  const base = new Date(Date.UTC(ano, pa.mes - 1, pa.dia))
  const movel = (offsetDias: number) => {
    const dt = new Date(base.getTime() + offsetDias * 86400000)
    return dt.getUTCMonth() + 1 === mes && dt.getUTCDate() === dia
  }
  // Carnaval (-47, terça), Sexta-Santa (-2), Corpus Christi (+60)
  return movel(-47) || movel(-2) || movel(60)
}

// Config ativa? (só faz sentido travar se algo foi configurado)
export function temRestricao(c: AcessoConfig): boolean {
  return !!(c.horaInicio && c.horaFim) || c.bloqSabado || c.bloqDomingo || c.bloqFeriado
}

// Bloqueado agora? Retorna motivo legível ou null.
export function acessoBloqueado(c: AcessoConfig, d: Date = new Date()): string | null {
  if (!temRestricao(c)) return null
  const { hhmm, diaSemana, ano, mes, dia } = agoraSaoPaulo(d)
  if (c.bloqDomingo && diaSemana === 0) return 'Acesso bloqueado aos domingos.'
  if (c.bloqSabado && diaSemana === 6) return 'Acesso bloqueado aos sábados.'
  if (c.bloqFeriado && ehFeriadoNacional(ano, mes, dia)) return 'Acesso bloqueado em feriados.'
  if (c.horaInicio && c.horaFim && (hhmm < c.horaInicio || hhmm > c.horaFim)) {
    return `Acesso permitido apenas das ${c.horaInicio} às ${c.horaFim}.`
  }
  return null
}
