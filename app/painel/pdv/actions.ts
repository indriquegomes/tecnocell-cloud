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

  // Baixar estoque e coletar novas quantidades
  const estoqueAtualizado: Record<string, number> = {}
  for (const item of itens) {
    const { data: estoqueItems } = await supabase
      .from('estoque')
      .select('id, quantidade')
      .eq('produto_id', item.produto_id)
      .gt('quantidade', 0)
      .order('quantidade', { ascending: false })

    let restante = item.quantidade
    for (const estItem of estoqueItems ?? []) {
      if (restante <= 0) break
      const debitar = Math.min(restante, estItem.quantidade)
      await supabase
        .from('estoque')
        .update({ quantidade: estItem.quantidade - debitar, updated_at: new Date().toISOString() })
        .eq('id', estItem.id)
      restante -= debitar
    }

    // Buscar total de estoque restante para este produto
    const { data: estoqueRestante } = await supabase
      .from('estoque')
      .select('quantidade')
      .eq('produto_id', item.produto_id)
    const totalRestante = (estoqueRestante ?? []).reduce((s, e) => s + (e.quantidade ?? 0), 0)
    estoqueAtualizado[item.produto_id] = totalRestante
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
