type DadosMensagemDevolucao = {
  tipo: string
  cliente: string
  valor: number
  numero: number | null
  produtos: { nome: string; quantidade: number }[]
}

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')

const listarProdutos = (produtos: DadosMensagemDevolucao['produtos']) => {
  const nomes = produtos.map(({ nome, quantidade }) => `${nome}${quantidade > 1 ? ` (${quantidade}x)` : ''}`)
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0]
}

export function mensagemDevolucao(dados: DadosMensagemDevolucao): string | null {
  if (!['credito_conta', 'cancelamento_fiado'].includes(dados.tipo)) return null
  const varios = dados.produtos.length > 1 || dados.produtos.some((p) => p.quantidade > 1)
  const produto = listarProdutos(dados.produtos)
  const venda = dados.numero ?? '—'

  if (dados.tipo === 'credito_conta') return `Olá, ${dados.cliente}! 😊

Geramos vale-crédito de ${dinheiro(dados.valor)}, referente ${varios ? 'aos produtos' : 'ao produto'} ${produto} da venda nº ${venda}.

Crédito disponível para próxima compra.

#TecnocellBrasil`

  return `Olá, ${dados.cliente}! 😊

Registramos devolução ${varios ? 'dos produtos' : 'do produto'} ${produto} da venda nº ${venda}.

Dívida de ${dinheiro(dados.valor)} foi cancelada. Saldo atualizado.

#TecnocellBrasil`
}

export function whatsappDevolucao(telefone: string | null, mensagem: string): string | null {
  let numero = telefone?.replace(/\D/g, '') ?? ''
  if (numero.startsWith('55') && numero.length > 11) numero = numero.slice(2)
  if (numero.length < 10 || numero.length > 11) return null
  return `https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`
}
