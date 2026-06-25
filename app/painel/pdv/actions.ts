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

  let usuario: { id: string; email: string | null }
  try {
    usuario = await requireAuth(accessToken)
  } catch (e) {
    return { erro: 'Sessão expirada. Recarregue a página (F5) e entre novamente. ' + (e instanceof Error ? e.message : '') }
  }

  let supabase: Awaited<ReturnType<typeof createServiceClient>>
  try {
    supabase = await createServiceClient()
  } catch (e) {
    return { erro: 'Erro ao conectar ao banco: ' + String(e) }
  }

  // Busca nome do vendedor no perfil
  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', usuario.id)
    .maybeSingle()
  const vendedorNome = perfil?.nome ?? usuario.email ?? ''

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

  // Registra vendedor + linka lancamento de fiado ao venda_id (não-crítico)
  const vendaId = data.venda_id as string
  supabase.from('vendas').update({
    vendedor_id: usuario.id,
    vendedor_nome: vendedorNome,
  }).eq('id', vendaId).then(() => {})

  // Linka qualquer lancamento fiado criado agora com o venda_id
  supabase.from('lancamentos')
    .update({ venda_id: vendaId })
    .eq('tipo', 'receber')
    .eq('status', 'pendente')
    .is('venda_id', null)
    .gte('created_at', new Date(Date.now() - 15000).toISOString())
    .then(() => {})

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
  codigo: number | null
  venda_id: string | null
}

export interface DetalheVenda {
  id: string
  numero: number | null
  total: number
  desconto: number
  created_at: string
  vendedor_nome: string | null
  deposito_nome: string | null
  observacoes: string | null
  forma_pagamento_nome: string | null
  itens: { nome: string; quantidade: number; preco_unitario: number; total_item: number }[]
}

export async function buscarCrediario(accessToken: string): Promise<CrediarioItem[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, descricao, valor, pessoa_nome, data_vencimento, created_at, codigo, venda_id')
    .eq('tipo', 'receber')
    .eq('status', 'pendente')
    .order('data_vencimento', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CrediarioItem[]
}

export async function buscarDetalheVenda(accessToken: string, vendaId: string): Promise<DetalheVenda | null> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()

  const [vendaRes, itensRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, total, created_at, vendedor_nome, forma_pagamento_id, deposito_id')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produtos(nome)')
      .eq('venda_id', vendaId),
  ])

  if (!vendaRes.data) return null
  const v = vendaRes.data as { id: string; total: number; created_at: string; vendedor_nome: string | null; forma_pagamento_id: string | null; deposito_id: string | null }

  // Busca nomes de forma e depósito
  const [formaRes, depositoRes] = await Promise.all([
    v.forma_pagamento_id
      ? supabase.from('formas_pagamento').select('nome').eq('id', v.forma_pagamento_id).maybeSingle()
      : Promise.resolve({ data: null }),
    v.deposito_id
      ? supabase.from('depositos').select('nome').eq('id', v.deposito_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    id: v.id,
    numero: null,
    total: v.total,
    desconto: 0,
    created_at: v.created_at,
    vendedor_nome: v.vendedor_nome ?? null,
    deposito_nome: (depositoRes as { data: { nome: string } | null }).data?.nome ?? null,
    observacoes: null,
    forma_pagamento_nome: (formaRes as { data: { nome: string } | null }).data?.nome ?? null,
    itens: ((itensRes.data ?? []) as unknown as { quantidade: number; preco_unitario: number; total_item: number; produtos: { nome: string } | null }[]).map((i) => ({
      nome: i.produtos?.nome ?? '—',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total_item: i.total_item,
    })),
  }
}

export async function pagarLancamentos(accessToken: string, ids: string[], formaPagamento = 'dinheiro'): Promise<void> {
  if (ids.length === 0) return
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('lancamentos')
    .update({ status: 'pago', data_pagamento: today, forma_pagamento: formaPagamento, updated_at: new Date().toISOString() })
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
