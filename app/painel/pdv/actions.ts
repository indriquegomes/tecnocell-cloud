'use server'

import { createServiceClient } from '@/lib/supabase/server'

interface ItemCarrinho {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
}

export interface PagamentoInput {
  forma_pagamento_id: string
  valor: number
  taxa: number
  maquina: string
  parcelas: number
  status: 'pago' | 'pendente'
}

export async function finalizarVenda(
  itens: ItemCarrinho[],
  pagamentos: PagamentoInput[],
  pessoa_id: string | null,
  desconto: number,
  observacoes: string,
  deposito_id: string = '',
) {
  if (itens.length === 0) throw new Error('Carrinho vazio')
  if (!deposito_id) throw new Error('Depósito não selecionado')
  if (pagamentos.length === 0) throw new Error('Selecione a forma de pagamento')
  const supabase = await createServiceClient()

  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const totalProdutos = Math.max(0, subtotal - desconto)
  const totalTaxas = pagamentos.reduce((s, p) => s + p.taxa, 0)
  const total = totalProdutos + totalTaxas

  // Buscar o estoque dos produtos NO depósito escolhido
  const produtoIds = itens.map((i) => i.produto_id)
  const { data: estoqueDep } = await supabase
    .from('estoque')
    .select('id, produto_id, quantidade')
    .eq('deposito_id', deposito_id)
    .in('produto_id', produtoIds)

  const estoqueByProduto: Record<string, { id: string; quantidade: number }> = {}
  for (const row of estoqueDep ?? []) {
    estoqueByProduto[row.produto_id] = { id: row.id, quantidade: row.quantidade }
  }

  // Bloqueio (a): validar saldo no depósito ANTES de criar a venda
  for (const item of itens) {
    const linha = estoqueByProduto[item.produto_id]
    const disponivel = linha?.quantidade ?? 0
    if (disponivel < item.quantidade) {
      throw new Error(`Estoque insuficiente para "${item.nome}" no depósito selecionado (disponível: ${disponivel}).`)
    }
  }

  // forma_pagamento_id: forma única se for só um pagamento, null se for misto
  const forma_pagamento_id = pagamentos.length === 1 ? pagamentos[0].forma_pagamento_id : null

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

  // Debitar do depósito escolhido (uma linha por produto)
  const updates = itens.map((item) => {
    const linha = estoqueByProduto[item.produto_id]
    return { id: linha.id, novaQtd: linha.quantidade - item.quantidade }
  })

  const now = new Date().toISOString()
  await Promise.all(
    updates.map(({ id, novaQtd }) =>
      supabase.from('estoque').update({ quantidade: novaQtd, updated_at: now }).eq('id', id)
    )
  )

  // Saldo restante no depósito vendido (para atualizar a tela)
  const estoqueAtualizado: Record<string, number> = {}
  for (const item of itens) {
    estoqueAtualizado[item.produto_id] = estoqueByProduto[item.produto_id].quantidade - item.quantidade
  }

  // Gravar pagamentos por forma (suporte a pagamento misto)
  await supabase.from('pagamentos_venda').insert(
    pagamentos.map((p) => ({
      venda_id: venda.id,
      forma_pagamento_id: p.forma_pagamento_id,
      valor: p.valor,
      taxa: p.taxa,
      maquina: p.maquina || null,
      parcelas: p.parcelas,
      status: p.status,
    }))
  )

  // Criar lançamentos financeiros — um para o total pago na hora, um para fiado (pendente)
  const today = new Date().toISOString().split('T')[0]
  const pagoTotal = pagamentos
    .filter((p) => p.status === 'pago')
    .reduce((s, p) => s + p.valor + p.taxa, 0)
  const fiadoTotal = pagamentos
    .filter((p) => p.status === 'pendente')
    .reduce((s, p) => s + p.valor, 0)

  if (pagoTotal > 0) {
    await supabase.from('lancamentos').insert({
      descricao: `Venda #${venda.id.slice(0, 8)}`,
      valor: pagoTotal,
      tipo: 'receber',
      data_competencia: today,
      data_vencimento: today,
      status: 'pago',
      data_pagamento: today,
      updated_at: new Date().toISOString(),
    })
  }

  if (fiadoTotal > 0) {
    let pessoaNome: string | null = null
    if (pessoa_id) {
      const { data: p } = await supabase.from('pessoas').select('nome').eq('id', pessoa_id).single()
      pessoaNome = p?.nome ?? null
    }
    await supabase.from('lancamentos').insert({
      descricao: `A Receber — Fiado #${venda.id.slice(0, 8)}`,
      valor: fiadoTotal,
      tipo: 'receber',
      data_competencia: today,
      data_vencimento: today,
      status: 'pendente',
      pessoa_nome: pessoaNome,
      updated_at: new Date().toISOString(),
    })
  }

  return { vendaId: venda.id, total, estoqueAtualizado }
}

export interface CrediarioItem {
  id: string
  descricao: string
  valor: number
  pessoa_nome: string | null
  data_vencimento: string | null
  created_at: string
}

export async function buscarCrediario(): Promise<CrediarioItem[]> {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, descricao, valor, pessoa_nome, data_vencimento, created_at')
    .eq('tipo', 'receber')
    .eq('status', 'pendente')
    .order('data_vencimento', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CrediarioItem[]
}

export async function pagarLancamentos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const supabase = await createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const { error } = await supabase
    .from('lancamentos')
    .update({ status: 'pago', data_pagamento: today, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw new Error(error.message)
}

export interface VendaResumo {
  id: string
  total: number
  desconto: number
  created_at: string
  forma_pagamento_id: string | null
  pessoa_id: string | null
}

// Buscar as últimas vendas concluídas para consulta no PDV (#9 Buscar Vendas)
export async function buscarVendas(limite: number = 30): Promise<VendaResumo[]> {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('vendas')
    .select('id, total, desconto, created_at, forma_pagamento_id, pessoa_id')
    .eq('status', 'concluida')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw new Error(error.message)
  return (data ?? []) as VendaResumo[]
}
