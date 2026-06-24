'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'

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
  accessToken: string,
  itens: ItemCarrinho[],
  pagamentos: PagamentoInput[],
  pessoa_id: string | null,
  desconto: number,
  observacoes: string,
  deposito_id: string = '',
): Promise<
  | { erro: string }
  | { vendaId: string; vendaNumero: number | null; total: number; estoqueAtualizado: Record<string, number> }
> {
  if (itens.length === 0) return { erro: 'Carrinho vazio' }
  if (!deposito_id) return { erro: 'Depósito não selecionado' }
  if (pagamentos.length === 0) return { erro: 'Selecione a forma de pagamento' }

  try {
    await requireAuth(accessToken)
  } catch (e) {
    return { erro: 'Sessão expirada. Recarregue a página (F5) e entre novamente. ' + (e instanceof Error ? e.message : '') }
  }

  let supabase: Awaited<ReturnType<typeof createServiceClient>>
  try {
    supabase = await createServiceClient()
  } catch (e) {
    return { erro: 'Erro ao conectar ao banco: ' + String(e) }
  }

  const { data, error } = await supabase.rpc('finalizar_venda', {
    p_itens: itens,
    p_pagamentos: pagamentos,
    p_pessoa_id: pessoa_id,
    p_desconto: desconto,
    p_observacoes: observacoes || null,
    p_deposito_id: deposito_id,
  })

  if (error) return { erro: error.message }
  if (!data) return { erro: 'RPC retornou vazio. Verifique o banco.' }

  return {
    vendaId: data.venda_id as string,
    vendaNumero: data.venda_numero as number | null,
    total: data.total as number,
    estoqueAtualizado: data.estoque_atualizado as Record<string, number>,
  }
}

export interface CrediarioItem {
  id: string
  descricao: string
  valor: number
  pessoa_nome: string | null
  data_vencimento: string | null
  created_at: string
}

export async function buscarCrediario(accessToken: string): Promise<CrediarioItem[]> {
  await requireAuth(accessToken)
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

export async function pagarLancamentos(accessToken: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('lancamentos')
    .update({ status: 'pago', data_pagamento: today, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Pagamento não registrado — sem permissão ou lançamento não encontrado.')
}

export interface ItemPedido {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  codigo: string | null
}

export interface PedidoResumo {
  id: string
  tipo: string
  status: string
  total: number
  created_at: string
  pessoa_nome: string | null
  itens: ItemPedido[]
}

export async function buscarPedidosAbertos(accessToken: string): Promise<PedidoResumo[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      id, tipo, status, total, created_at,
      pessoa:pessoas(nome),
      itens:itens_pedido(produto_id, quantidade, preco_unitario, produto:produtos(nome, codigo))
    `)
    .in('status', ['rascunho', 'pendente', 'aprovado'])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    tipo: p.tipo ?? 'orcamento',
    status: p.status,
    total: p.total ?? 0,
    created_at: p.created_at,
    pessoa_nome: p.pessoa?.nome ?? null,
    itens: (p.itens ?? []).map((i: any) => ({
      produto_id: i.produto_id,
      nome: i.produto?.nome ?? 'Produto',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      codigo: i.produto?.codigo ?? null,
    })),
  }))
}

export interface ItemConsignado {
  produto_id: string
  nome: string
  codigo: string | null
  quantidade: number
  preco_unitario: number
}

export async function registrarConsignado(
  accessToken: string,
  itens: ItemConsignado[],
  pessoa_id: string | null,
  pessoa_nome: string | null,
  deposito_id: string,
  observacoes: string,
): Promise<string> {
  if (itens.length === 0) throw new Error('Adicione itens ao consignado.')
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const total = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const id = crypto.randomUUID()
  const { error: eC } = await supabase.from('consignados').insert({
    id, pessoa_id, pessoa_nome, deposito_id, observacoes: observacoes || null, total, status: 'aberto',
  })
  if (eC) throw new Error(eC.message)
  const { error: eI } = await supabase.from('itens_consignado').insert(
    itens.map((i) => ({
      consignado_id: id,
      produto_id: i.produto_id,
      nome: i.nome,
      codigo: i.codigo,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
    }))
  )
  if (eI) throw new Error(eI.message)
  return id
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
export async function buscarVendas(accessToken: string, limite: number = 30): Promise<VendaResumo[]> {
  await requireAuth(accessToken)
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
