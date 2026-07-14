// Rotina de pagamento do fiado — o COMBINADO com o cliente (quase sempre lojista).
//
// Vitor: "normalmente temos rotina das pessoas que pagam em certa hora — as que pagam
// no final do dia, colocar como padrão no cadastro dela". Serve pro balcão saber que
// aquele saldo devedor é NORMAL (o cara acumula de manhã e acerta 18h) e não virar
// cobrança constrangedora — e, ao contrário, destacar quem fugiu da própria rotina.

export const ROTINAS_PAGAMENTO = [
  { id: 'fim_do_dia', label: 'Paga no fim do dia', icone: '🕕', curto: 'fim do dia' },
  { id: 'semanal',    label: 'Acerta toda semana', icone: '📅', curto: 'semanal' },
  { id: 'quinzenal',  label: 'Acerta na quinzena', icone: '🗓️', curto: 'quinzenal' },
  { id: 'mensal',     label: 'Acerta no mês',      icone: '📆', curto: 'mensal' },
] as const

export const rotulaRotina = (id: string | null | undefined) =>
  ROTINAS_PAGAMENTO.find((r) => r.id === id) ?? null
