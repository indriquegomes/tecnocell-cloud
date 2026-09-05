type NotaCobranca = {
  codigo: number | null
  descricao: string | null
  pecas: string | null
  valor: number
  vencimento: string | null
}

type ClienteCobranca = {
  nome: string
  total: number
  notas: NotaCobranca[]
}

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')

const dataBR = (data: string) => data.slice(0, 10).split('-').reverse().join('/')

export function montarMensagemCobranca(cliente: ClienteCobranca, dataCobranca: string, blocoPagamento = ''): string {
  const datas = cliente.notas.flatMap((nota) => nota.vencimento ? [nota.vencimento] : []).sort()
  const periodo = datas.length ? `${dataBR(datas[0])} a ${dataBR(datas[datas.length - 1])}` : '—'
  const pecas = cliente.notas.map((nota) => {
    const nome = nota.pecas?.trim() || nota.descricao?.trim() || 'Compra'
    return `- ${nome} — ${dinheiro(nota.valor)}`
  })
  const codigo = dataBR(dataCobranca).replace(/\D/g, '')

  return `Olá, ${cliente.nome}! 😊

Saldo em aberto: ${dinheiro(cliente.total)}
Período: ${periodo}.

Peças:

${pecas.join('\n')}${blocoPagamento}

Por favor, verificar acerto. Obrigado!
#CBRÇ${codigo}`
}
