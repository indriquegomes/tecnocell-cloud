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

type ItemVendaCobranca = {
  venda_id: string
  produto_id: string
  nome: string
  quantidade: number
}

type ItemDevolvidoCobranca = Omit<ItemVendaCobranca, 'nome'>

export function pecasRestantesPorVenda(
  vendidos: ItemVendaCobranca[],
  devolvidos: ItemDevolvidoCobranca[],
): Map<string, string[]> {
  const devolvidoPorItem = new Map<string, number>()
  for (const item of devolvidos) {
    const chave = `${item.venda_id}\0${item.produto_id}`
    devolvidoPorItem.set(chave, (devolvidoPorItem.get(chave) ?? 0) + Number(item.quantidade))
  }

  const vendidoPorItem = new Map<string, ItemVendaCobranca>()
  for (const item of vendidos) {
    const chave = `${item.venda_id}\0${item.produto_id}`
    const atual = vendidoPorItem.get(chave)
    vendidoPorItem.set(chave, { ...item, quantidade: (atual?.quantidade ?? 0) + Number(item.quantidade) })
  }

  const resultado = new Map<string, string[]>()
  for (const [chave, item] of vendidoPorItem) {
    const quantidade = Math.max(item.quantidade - (devolvidoPorItem.get(chave) ?? 0), 0)
    if (quantidade <= 0.001) continue
    const pecas = resultado.get(item.venda_id) ?? []
    pecas.push(quantidade > 1 ? `${quantidade}x ${item.nome}` : item.nome)
    resultado.set(item.venda_id, pecas)
  }
  return resultado
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
