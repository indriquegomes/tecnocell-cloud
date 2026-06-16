'use server'

import { createServiceClient } from '@/lib/supabase/server'

interface ItemCarrinho {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
}

export async function finalizarVenda(
  itens: ItemCarrinho[],
  forma_pagamento_id: string | null,
  pessoa_id: string | null,
  desconto: number,
  observacoes: string,
) {
  if (itens.length === 0) throw new Error('Carrinho vazio')
  const supabase = await createServiceClient()

  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const total = Math.max(0, subtotal - desconto)

  // Criar venda
  const { data: venda, error: errVenda } = await supabase
    .from('vendas')
    .insert({ total, desconto, forma_pagamento_id, pessoa_id, observacoes: observacoes || null, status: 'concluida' })
    .select('id')
    .single()

  if (errVenda || !venda) throw new Error(errVenda?.message ?? 'Erro ao criar venda')

  // Inserir itens
  const itensInsert = itens.map((i) => ({
    venda_id: venda.id,
    produto_id: i.produto_id,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    desconto_item: 0,
    total_item: i.quantidade * i.preco_unitario,
  }))

  const { error: errItens } = await supabase.from('itens_venda').insert(itensInsert)
  if (errItens) throw new Error(errItens.message)

  // Buscar estoque de todos os produtos do carrinho em uma única query
  const produtoIds = itens.map((i) => i.produto_id)
  const { data: todosEstoque } = await supabase
    .from('estoque')
    .select('id, produto_id, quantidade')
    .in('produto_id', produtoIds)
    .gt('quantidade', 0)
    .order('quantidade', { ascending: false })

  // Agrupar por produto (em memória) e calcular quais linhas precisam de update
  const estoqueByProduto: Record<string, { id: string; quantidade: number }[]> = {}
  for (const row of todosEstoque ?? []) {
    if (!estoqueByProduto[row.produto_id]) estoqueByProduto[row.produto_id] = []
    estoqueByProduto[row.produto_id].push({ id: row.id, quantidade: row.quantidade })
  }

  const updates: { id: string; novaQtd: number }[] = []
  for (const item of itens) {
    let restante = item.quantidade
    for (const estRow of estoqueByProduto[item.produto_id] ?? []) {
      if (restante <= 0) break
      const debitar = Math.min(restante, estRow.quantidade)
      updates.push({ id: estRow.id, novaQtd: estRow.quantidade - debitar })
      restante -= debitar
    }
  }

  // Executar updates em paralelo (um por linha de estoque afetada)
  const now = new Date().toISOString()
  await Promise.all(
    updates.map(({ id, novaQtd }) =>
      supabase.from('estoque').update({ quantidade: novaQtd, updated_at: now }).eq('id', id)
    )
  )

  // Calcular quantidades restantes a partir dos dados já carregados, aplicando os débitos
  const estoqueAtualizado: Record<string, number> = {}
  const debitosById = Object.fromEntries(updates.map(({ id, novaQtd }) => [id, novaQtd]))
  for (const id of produtoIds) {
    estoqueAtualizado[id] = (todosEstoque ?? [])
      .filter((e) => e.produto_id === id)
      .reduce((s, e) => s + (debitosById[e.id] ?? e.quantidade), 0)
  }

  // Criar lançamento financeiro
  await supabase.from('lancamentos').insert({
    descricao: `Venda #${venda.id.slice(0, 8)}`,
    valor: total,
    tipo: 'receber',
    data_competencia: new Date().toISOString().split('T')[0],
    data_vencimento: new Date().toISOString().split('T')[0],
    status: 'pago',
    data_pagamento: new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  })

  return { vendaId: venda.id, total, estoqueAtualizado }
}
