export type ItemPedidoApp = { id: string; nome: string; loja: string; quantidade: number; preco: number }
export type PedidoAppAtendimento = {
  id: string; pessoaId: string; cliente: string; status: string; pagamento: string; criadoEm: string;
  itens: ItemPedidoApp[]; total: number; confirmado: boolean; vendaId: string | null;
}
export type UnidadePedidoApp = { unidade: string; lojaId: string; nome: string }
export type DadosPedidosApp = {
  unidades: UnidadePedidoApp[]; unidade: UnidadePedidoApp | null; pedidos: PedidoAppAtendimento[];
  depositos: { id: string; nome: string }[];
  formas: { id: string; nome: string; tipo: string }[];
}

export function itensDaUnidade(valor: unknown, unidade: string): ItemPedidoApp[] {
  if (!Array.isArray(valor)) throw new Error('Itens do pedido inválidos.')
  const itens: ItemPedidoApp[] = []
  const ids = new Set<string>()
  for (const item of valor) {
    if (!item || typeof item !== 'object' || typeof item.loja !== 'string') throw new Error('Unidade do pedido inválida.')
    if (item.loja !== unidade) continue
    const preco = Number(item.preco)
    if (typeof item.id !== 'string' || !item.id.trim() || typeof item.nome !== 'string'
      || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 100
      || !Number.isFinite(preco) || preco <= 0 || ids.has(item.id)) throw new Error('Itens do pedido inválidos.')
    ids.add(item.id)
    itens.push({ id: item.id, nome: item.nome, loja: unidade, quantidade: item.quantidade, preco })
  }
  if (!itens.length || itens.length > 50) throw new Error('Pedido sem itens válidos nesta unidade.')
  return itens
}
