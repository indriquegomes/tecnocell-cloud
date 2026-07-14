// Rotinas da equipe que o sistema cobra: "Duda conferir caixa 18:30", "Mari limpar
// a loja 09:00". Não é agenda — é a mesma coisa todo dia, e a pessoa marca como FEITO.
//
// O "feito" é o que separa isto de um alarme: sem ele ninguém sabe se a loja foi limpa.

export interface Lembrete {
  id: string
  titulo: string
  descricao: string | null
  perfil_id: string | null
  cargo_id: string | null
  hora: string          // "18:30:00"
  dias: number[]        // 0=dom … 6=sáb
  ativo: boolean
}

export interface LembretePendente {
  id: string
  titulo: string
  descricao: string | null
  hora: string          // "18:30"
  minutosDesde: number  // quanto passou da hora
  atrasado: boolean     // mais de 1h
}

export interface LembreteFeito {
  lembrete_id: string
  perfil_id: string | null
  feito_em: string
}

// Hoje no fuso da loja. A Vercel roda em UTC: sem isto, o lembrete das 18:30
// dispararia às 15:30 da loja.
export function hojeSP(base = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(base)) p[x.type] = x.value
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    minutosDoDia: Number(p.hour) * 60 + Number(p.minute),
    diaSemana: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  }
}

const hhmm = (hora: string) => hora.slice(0, 5)

/** Um lembrete é MEU se é nominal pra mim, do meu cargo, ou da loja toda (sem dono). */
export function ehMeu(l: Lembrete, perfilId: string, cargoId: string | null): boolean {
  if (l.perfil_id) return l.perfil_id === perfilId
  if (l.cargo_id) return l.cargo_id === cargoId
  return true
}

export function pendentesDeHoje(
  lembretes: Lembrete[],
  feitosHoje: LembreteFeito[],
  perfilId: string,
  cargoId: string | null,
  base = new Date(),
): LembretePendente[] {
  const hoje = hojeSP(base)
  const jaFeito = new Set(feitosHoje.map((f) => f.lembrete_id))

  return lembretes
    .filter((l) => l.ativo)
    .filter((l) => ehMeu(l, perfilId, cargoId))
    .filter((l) => (l.dias ?? []).includes(hoje.diaSemana))
    .filter((l) => !jaFeito.has(l.id))
    .map((l) => {
      const [h, m] = hhmm(l.hora).split(':').map(Number)
      const passou = hoje.minutosDoDia - ((h || 0) * 60 + (m || 0))
      return {
        id: l.id,
        titulo: l.titulo,
        descricao: l.descricao,
        hora: hhmm(l.hora),
        minutosDesde: passou,
        atrasado: passou >= 60,
      }
    })
    // só aparece DEPOIS da hora — antes disso não é lembrete, é agenda
    .filter((p) => p.minutosDesde >= 0)
    .sort((a, b) => b.minutosDesde - a.minutosDesde)
}

export const DIAS_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
