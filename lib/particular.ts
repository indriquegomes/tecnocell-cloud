// CÁLCULO DA ABA PARTICULAR — função pura, fora da página, para poder ser testada.
//
// A régua combinada com o dono: o pró-labore do mês é o dinheiro reservado; cada conta
// particular paga sai dele; o que sobra é o que ainda pode ser retirado. Conta
// cancelada não entra em nada.
export type LinhaParticular = {
  categoria: string | null
  valor?: number | null
  valor_pago?: number | null
  status?: string | null
}

export type ResumoParticular = {
  /** soma das linhas de Pró-labore do mês */
  proLaborePrevisto: number
  /** quanto do pró-labore já foi recebido */
  proLaborePago: number
  /** contas particulares já pagas no mês */
  particularPago: number
  /** contas particulares ainda a pagar */
  particularPendente: number
  /** pró-labore − contas pagas (pode ficar negativo) */
  sobra: number
}

const round2 = (n: number) => Math.round((n || 0) * 100) / 100
const valor = (l: LinhaParticular) => Number(l.valor ?? 0) || 0
const ehPago = (l: LinhaParticular) => (l.status ?? '').toLowerCase() === 'pago'
const ehCancelado = (l: LinhaParticular) => (l.status ?? '').toLowerCase() === 'cancelado'

export function resumoParticular(linhas: LinhaParticular[]): ResumoParticular {
  const vivas = (linhas ?? []).filter((l) => !ehCancelado(l))
  const proLabore = vivas.filter((l) => (l.categoria ?? '').trim() === 'Pró-labore')
  const particular = vivas.filter((l) => (l.categoria ?? '').trim() === 'Particular')

  const soma = (xs: LinhaParticular[]) => round2(xs.reduce((t, l) => t + valor(l), 0))

  const proLaborePrevisto = soma(proLabore)
  const proLaborePago = soma(proLabore.filter(ehPago))
  const particularPago = soma(particular.filter(ehPago))
  const particularPendente = round2(soma(particular.filter((l) => !ehPago(l))))

  return {
    proLaborePrevisto,
    proLaborePago,
    particularPago,
    particularPendente,
    sobra: round2(proLaborePrevisto - particularPago),
  }
}
