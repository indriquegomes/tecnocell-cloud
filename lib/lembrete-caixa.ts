// Lembrete de fechar o caixa.
//
// Nasceu de um caixa que passou a NOITE aberto (13/07): ninguém fechou e no dia
// seguinte o saldo do dia anterior ainda estava rolando. O sistema sabia — só não
// avisava ninguém.
//
// Regra: a loja fecha 19h na semana e 17h no sábado. O lembrete aparece ~30min antes
// (18:30 / 16:30), que é quando ainda dá tempo de contar a gaveta sem correria.
// Domingo não tem expediente, então qualquer caixa aberto no domingo já é esquecimento.

export interface HorariosCaixa {
  semana: string   // "18:30"
  sabado: string   // "16:30"
}

export const HORARIOS_PADRAO: HorariosCaixa = { semana: '18:30', sabado: '16:30' }

export type Urgencia = 'lembrete' | 'atrasado' | 'ontem'

export interface Lembrete {
  caixaId: string
  loja: string
  abertoEm: string
  urgencia: Urgencia
  horaLimite: string
  minutosDesde: number   // desde a hora limite
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// "agora" no fuso da loja, sem depender do fuso do servidor (a Vercel roda em UTC)
function agoraSP(base = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(base)) p[x.type] = x.value
  const diaSemana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    minutosDoDia: Number(p.hour) * 60 + Number(p.minute),
    diaSemana,   // 0 = domingo
  }
}

export function lembretesDeCaixa(
  abertos: { id: string; aberto_em: string; loja: string | null }[],
  horarios: HorariosCaixa = HORARIOS_PADRAO,
  base = new Date(),
): Lembrete[] {
  const hoje = agoraSP(base)
  const out: Lembrete[] = []

  for (const c of abertos) {
    const dia = agoraSP(new Date(c.aberto_em))

    // Caixa aberto num dia anterior — nunca foi fechado. É o caso mais grave e
    // independe de hora: às 9h da manhã já tem que gritar.
    if (dia.data < hoje.data) {
      out.push({
        caixaId: c.id,
        loja: c.loja ?? 'Loja',
        abertoEm: c.aberto_em,
        urgencia: 'ontem',
        horaLimite: '—',
        minutosDesde: 0,
      })
      continue
    }

    // Domingo não abre: se tem caixa aberto, é esquecimento do sábado
    if (hoje.diaSemana === 0) continue

    const limite = hoje.diaSemana === 6 ? horarios.sabado : horarios.semana
    const passou = hoje.minutosDoDia - minutos(limite)
    if (passou < 0) continue

    out.push({
      caixaId: c.id,
      loja: c.loja ?? 'Loja',
      abertoEm: c.aberto_em,
      // depois de 1h do limite deixa de ser lembrete e vira atraso
      urgencia: passou >= 60 ? 'atrasado' : 'lembrete',
      horaLimite: limite,
      minutosDesde: passou,
    })
  }

  return out
}
