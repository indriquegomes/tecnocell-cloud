type NotaCobranca = {
  codigo: number | null
  numeroVenda?: number | null
  descricao: string | null
  pecas: string | null
  itens?: { nome: string; quantidade: number; valor: number }[] | null
  valor: number
  valorPago?: number
  vencimento: string | null
}

type ClienteCobranca = {
  nome: string
  total: number
  notas: NotaCobranca[]
}

type ItemVendaValoresCobranca = { produto_id: string | null; nome: string; quantidade: number; valor: number }
type ItemDevolvidoValoresCobranca = { produto_id: string | null; quantidade: number; valor: number }

export function reconciliarItensCobranca(
  vendidos: ItemVendaValoresCobranca[], devolvidos: ItemDevolvidoValoresCobranca[],
): { nome: string; quantidade: number; valor: number }[] | null {
  const itens = vendidos.map((item) => ({ ...item }))
  for (const devolvido of devolvidos) {
    const candidatos = itens.filter((item) => item.produto_id && item.produto_id === devolvido.produto_id)
    if (candidatos.length !== 1 || devolvido.quantidade <= 0 || devolvido.valor <= 0) return null
    const item = candidatos[0]
    if (devolvido.quantidade > item.quantidade || devolvido.valor > item.valor + 0.01) return null
    item.quantidade -= devolvido.quantidade
    item.valor = Math.round((item.valor - devolvido.valor) * 100) / 100
  }
  return itens.filter((item) => item.quantidade > 0)
    .map(({ nome, quantidade, valor }) => ({ nome, quantidade, valor }))
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
  const vendas = cliente.notas.map((nota) => {
    const titulo = nota.numeroVenda != null ? `Venda #${nota.numeroVenda}` : (nota.descricao?.trim() || (nota.codigo != null ? `Fiado #${nota.codigo}` : 'Compra'))
    const pecas = nota.itens?.length
      ? nota.itens.map((item) => `📦 ${item.quantidade > 1 ? `${item.quantidade}x ` : ''}${item.nome} — ${dinheiro(item.valor)}`).join('\n')
      : nota.itens ? '📦 Peças devolvidas; conferir saldo pendente'
        : '📦 Itens indisponíveis; confira esta venda no sistema'
    const pago = (nota.valorPago ?? 0) > 0 ? `\n✅ Já pago nesta venda: ${dinheiro(nota.valorPago!)}` : ''
    return `🧾 ${titulo} — falta pagar ${dinheiro(nota.valor)}\n${pecas}${pago}`
  })
  const totalPecas = cliente.notas.flatMap((nota) => nota.itens ?? []).reduce((soma, item) => soma + item.valor, 0)
  const totalPago = cliente.notas.reduce((soma, nota) => soma + (nota.valorPago ?? 0), 0)
  const aviso = cliente.notas.every((nota) => nota.itens?.length) && totalPecas > cliente.total + totalPago + 0.01
    ? '\n\nValores das peças são da venda; saldo já considera pagamentos e ajustes.'
    : ''
  const codigo = dataBR(dataCobranca).replace(/\D/g, '')

  return `Olá, ${cliente.nome}! 😊

💰 Saldo total em aberto: ${dinheiro(cliente.total)}
Período: ${periodo}.

${vendas.join('\n\n')}${aviso}${blocoPagamento}

Por favor, confira os valores e nos avise quando puder acertar. Obrigado! 🤝
#CBRÇ${codigo}`
}
