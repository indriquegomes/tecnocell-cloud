export type TipoDescontoItem = 'final' | 'valor' | 'percent'

const centavos = (valor: number) => Math.round(valor * 100) / 100

export function aplicarDescontoItem(precoBase: number, tipo: TipoDescontoItem, valor: number) {
  const base = Math.max(0, Number(precoBase) || 0)
  const informado = Math.max(0, Number(valor) || 0)
  const desconto = tipo === 'percent'
    ? base * informado / 100
    : tipo === 'final' ? base - informado : informado
  const descontoUnitario = centavos(Math.min(base, Math.max(0, desconto)))
  return { descontoUnitario, precoFinal: centavos(base - descontoUnitario) }
}

export function distribuirRecebimento(
  itens: { id: string; restante: number; vencimento: string | null }[],
  total: number,
) {
  let disponivel = centavos(Math.max(0, Number(total) || 0))
  const resultado = Object.fromEntries(itens.map((item) => [item.id, 0])) as Record<string, number>
  const ordenados = [...itens].sort((a, b) => (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999'))
  for (const item of ordenados) {
    const valor = centavos(Math.min(Math.max(0, item.restante), disponivel))
    resultado[item.id] = valor
    disponivel = centavos(disponivel - valor)
  }
  return resultado
}
