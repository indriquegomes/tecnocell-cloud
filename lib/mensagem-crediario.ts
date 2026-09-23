type DadosMensagemPagamentoCrediario = {
  cliente: string
  valor: number
  forma: string
  notas: (string | null)[]
  saldoRestante: number
}

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')

// Mensagem pronta pra copiar e mandar pro cliente depois de quitar um pagamento do
// crediário (F9). Espelha o padrão de lib/mensagem-devolucao.ts (texto pronto + testável).
export function mensagemPagamentoCrediario(dados: DadosMensagemPagamentoCrediario): string {
  const notas = dados.notas.filter((n): n is string => !!n)
  const onde = notas.length === 0
    ? ''
    : notas.length === 1
      ? ` na nota ${notas[0]}`
      : ` nas notas ${notas.join(', ')}`

  return `Olá, ${dados.cliente}! 🧡

Seu pagamento de ${dinheiro(dados.valor)} foi recebido em ${dados.forma.toUpperCase()} e abatido${onde}.

Saldo restante atualizado: ${dinheiro(dados.saldoRestante)}.`
}
