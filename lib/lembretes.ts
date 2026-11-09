// Rotinas da equipe que o sistema cobra: "Maria Eduarda Kappler da Silva conferir caixa 18:30", "Mariana Vila Real Castelli limpar
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
  tipo: string          // 'rotina' | 'pagamento'
  valor: number | null  // reais, só pra 'pagamento'
  chave_pix: string | null
}

export interface LembretePendente {
  id: string
  titulo: string
  descricao: string | null
  hora: string          // "18:30"
  minutosDesde: number  // quanto passou da hora
  atrasado: boolean     // mais de 1h
  tipo: string          // 'rotina' | 'pagamento'
  valor: number | null
  chave_pix: string | null
}

export interface LembreteFeito {
  lembrete_id: string
  perfil_id: string | null
  feito_em: string
  data?: string | null   // 'YYYY-MM-DD' — o dia a que o "feito" se refere
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

/** Data 'YYYY-MM-DD' de N dias atrás (aritmética de calendário, sem fuso). */
export function diasAtras(data: string, n: number): string {
  const [a, m, d] = data.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d))
  t.setUTCDate(t.getUTCDate() - n)
  return t.toISOString().slice(0, 10)
}

/** O dia agendado mais recente (hoje ou nos últimos 6 dias) — 'YYYY-MM-DD' ou null. */
function ultimaDataAgendada(hoje: { data: string; diaSemana: number }, dias: number[]): string | null {
  for (let k = 0; k < 7; k++) {
    const dow = ((hoje.diaSemana - k) % 7 + 7) % 7
    if (dias.includes(dow)) return k === 0 ? hoje.data : diasAtras(hoje.data, k)
  }
  return null
}

export function pendentesDeHoje(
  lembretes: Lembrete[],
  feitosHoje: LembreteFeito[],
  perfilId: string,
  cargoId: string | null,
  base = new Date(),
  ehMaster = false,
): LembretePendente[] {
  const hoje = hojeSP(base)
  const jaFeito = new Set(feitosHoje.map((f) => f.lembrete_id))
  const ehPagamento = (l: Lembrete) => (l.tipo ?? 'rotina') === 'pagamento'
  const saida: LembretePendente[] = []

  // ── PAGAMENTO: só o master vê e só ele marca (o dinheiro é dele) ────────────
  // Diferente da rotina, não desaparece no dia seguinte: fica no topo até alguém
  // marcar Pago a semana agendada. Sem isso, salário de sexta sumia no sábado sem
  // ninguém ter pago — e o lançamento nunca aparecia no financeiro.
  if (ehMaster) {
    for (const l of lembretes) {
      if (!l.ativo || !ehPagamento(l)) continue
      const agendada = ultimaDataAgendada(hoje, l.dias ?? [])
      if (!agendada) continue
      const feitoNaSemana = feitosHoje.some((f) => f.lembrete_id === l.id && (f.data ?? '') >= agendada)
      if (feitoNaSemana) continue
      const [h, m] = hhmm(l.hora).split(':').map(Number)
      const minutosDoHorario = (h || 0) * 60 + (m || 0)
      const diasDeAtraso = Math.round(
        (Date.parse(hoje.data + 'T00:00:00Z') - Date.parse(agendada + 'T00:00:00Z')) / 86400000,
      )
      const passou = diasDeAtraso * 1440 + (hoje.minutosDoDia - minutosDoHorario)
      // hoje: só depois da hora (antes é agenda, não lembrete)
      if (diasDeAtraso === 0 && passou < 0) continue
      saida.push({
        id: l.id,
        titulo: l.titulo,
        descricao: l.descricao,
        hora: hhmm(l.hora),
        minutosDesde: passou,
        atrasado: passou >= 60,
        tipo: 'pagamento',
        valor: l.valor ?? null,
        chave_pix: l.chave_pix ?? null,
      })
    }
  }

  // ── ROTINA: como sempre foi (aparece no dia, some quando a pessoa marca) ───
  for (const l of lembretes) {
    if (!l.ativo || ehPagamento(l)) continue
    if (!ehMeu(l, perfilId, cargoId)) continue
    if (!(l.dias ?? []).includes(hoje.diaSemana)) continue
    if (jaFeito.has(l.id)) continue
    const [h, m] = hhmm(l.hora).split(':').map(Number)
    const passou = hoje.minutosDoDia - ((h || 0) * 60 + (m || 0))
    // só aparece DEPOIS da hora — antes disso não é lembrete, é agenda
    if (passou < 0) continue
    saida.push({
      id: l.id,
      titulo: l.titulo,
      descricao: l.descricao,
      hora: hhmm(l.hora),
      minutosDesde: passou,
      atrasado: passou >= 60,
      tipo: 'rotina',
      valor: l.valor ?? null,
      chave_pix: l.chave_pix ?? null,
    })
  }

  return saida.sort((a, b) => b.minutosDesde - a.minutosDesde)
}

export const DIAS_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
