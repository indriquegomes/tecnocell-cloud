'use server'

import { createServiceClient, requirePermissao, permissoesEfetivas } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'

// Confere a senha de desconto da loja no servidor (a senha nunca vai pro cliente)
export async function validarSenhaDesconto(lojaId: string, senha: string): Promise<boolean> {
  const supabase = await createServiceClient()
  const { data } = await supabase.from('lojas').select('senha_desconto').eq('id', lojaId).maybeSingle()
  const esperada = (data?.senha_desconto ?? '').trim()
  return !esperada || senha.trim() === esperada
}

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
  series: { produto_id: string; serie: string }[] = [],
  credito_valor: number = 0,
  desconto_manual: number = 0,
): Promise<
  | { erro: string }
  | { vendaId: string; vendaNumero: number | null; total: number; estoqueAtualizado: Record<string, number> }
> {
  if (itens.length === 0) return { erro: 'Carrinho vazio' }
  if (!deposito_id) return { erro: 'Depósito não selecionado' }
  if (pagamentos.length === 0) return { erro: 'Selecione a forma de pagamento' }

  let usuario: { id: string; email: string | null }
  try {
    usuario = await requirePermissao('pdv', accessToken)
  } catch (e) {
    return { erro: 'Sessão expirada. Recarregue a página (F5) e entre novamente. ' + (e instanceof Error ? e.message : '') }
  }

  // Limite de operação: só quem tem 'venda_desconto' pode dar desconto MANUAL.
  // (desconto de promoção é automático e não conta.)
  if (desconto_manual > 0) {
    const { permissoes, isMaster } = await permissoesEfetivas(usuario.id)
    if (!temPermissao(permissoes, 'venda_desconto', isMaster)) {
      return { erro: 'Seu cargo não permite dar desconto. Chame o gerente.' }
    }
  }

  // Piso de venda: item abaixo do preco_minimo exige 'venda_abaixo_minimo'.
  try {
    const svc = await createServiceClient()
    const { data: pisos } = await svc.from('produtos')
      .select('id, nome, preco_minimo')
      .in('id', itens.map((i) => i.produto_id))
      .gt('preco_minimo', 0)
    const abaixo = (pisos ?? [])
      .map((p) => ({ ...p, item: itens.find((i) => i.produto_id === p.id) }))
      .filter((p) => p.item && p.item.preco_unitario < Number(p.preco_minimo))
    if (abaixo.length > 0) {
      const { permissoes, isMaster } = await permissoesEfetivas(usuario.id)
      if (!temPermissao(permissoes, 'venda_abaixo_minimo', isMaster)) {
        const p = abaixo[0]
        return { erro: `"${p.nome}" está abaixo do preço mínimo (R$ ${Number(p.preco_minimo).toFixed(2)}). Seu cargo não permite vender abaixo do piso.` }
      }
    }
  } catch { /* coluna preco_minimo ainda não existe — sem piso */ }

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
    p_series: series,
    p_vendedor_id: usuario.id,
    p_vendedor_nome: vendedorNome,
    p_credito_valor: credito_valor,
  })

  if (error) return { erro: error.message }
  if (!data) return { erro: 'RPC retornou vazio. Verifique o banco.' }

  // Vendedor (rastreabilidade), fiado vinculado e baixa de IMEI já nascem
  // dentro do RPC finalizar_venda — sem escrita posterior nem race.

  return {
    vendaId: data.venda_id as string,
    vendaNumero: data.venda_numero as number | null,
    total: data.total as number,
    estoqueAtualizado: data.estoque_atualizado as Record<string, number>,
  }
}

export interface PagamentoHistorico {
  valor: number
  forma: string
  data: string
}

export interface CrediarioItem {
  id: string
  descricao: string
  valor: number
  valor_pago: number
  pessoa_nome: string | null
  data_vencimento: string | null
  created_at: string
  codigo: number | null
  venda_id: string | null
  historico_pagamentos: PagamentoHistorico[] | null
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
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, descricao, valor, valor_pago, pessoa_nome, data_vencimento, created_at, codigo, venda_id, historico_pagamentos')
    .eq('tipo', 'receber')
    .eq('status', 'pendente')
    .order('data_vencimento', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CrediarioItem[]
}

export async function buscarDetalheVenda(accessToken: string, vendaId: string): Promise<DetalheVenda | null> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, pagamentosRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, desconto, observacoes, created_at, vendedor_nome, forma_pagamento_id, deposito_id')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produtos(nome)')
      .eq('venda_id', vendaId),
    supabase
      .from('pagamentos_venda')
      .select('forma_pagamento_id')
      .eq('venda_id', vendaId),
  ])

  if (!vendaRes.data) return null
  const v = vendaRes.data as { id: string; numero: number | null; total: number; desconto: number | null; observacoes: string | null; created_at: string; vendedor_nome: string | null; forma_pagamento_id: string | null; deposito_id: string | null }

  // Formas de pagamento reais (pagamento misto via pagamentos_venda;
  // fallback p/ forma_pagamento_id em vendas antigas)
  const formaIds = [...new Set(
    ((pagamentosRes.data ?? []) as { forma_pagamento_id: string | null }[])
      .map((p) => p.forma_pagamento_id)
      .filter((id): id is string => !!id)
  )]
  if (formaIds.length === 0 && v.forma_pagamento_id) formaIds.push(v.forma_pagamento_id)

  const [formasRes, depositoRes] = await Promise.all([
    formaIds.length
      ? supabase.from('formas_pagamento').select('nome').in('id', formaIds)
      : Promise.resolve({ data: [] }),
    v.deposito_id
      ? supabase.from('depositos').select('nome').eq('id', v.deposito_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const formaNome = ((formasRes as { data: { nome: string }[] | null }).data ?? [])
    .map((f) => f.nome).join(' + ') || null

  return {
    id: v.id,
    numero: v.numero,
    total: v.total,
    desconto: v.desconto ?? 0,
    created_at: v.created_at,
    vendedor_nome: v.vendedor_nome ?? null,
    deposito_nome: (depositoRes as { data: { nome: string } | null }).data?.nome ?? null,
    observacoes: v.observacoes,
    forma_pagamento_nome: formaNome,
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
  await requirePermissao('crediario_receber', accessToken)
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

export async function registrarPagamentoParcial(
  accessToken: string,
  id: string,
  valorPago: number,
  formaPagamento: string,
): Promise<{ quitado: boolean }> {
  await requirePermissao('crediario_receber', accessToken)
  const supabase = await createServiceClient()

  const { data: lanc, error: errBusca } = await supabase
    .from('lancamentos')
    .select('valor, valor_pago, historico_pagamentos')
    .eq('id', id)
    .single()
  if (errBusca || !lanc) throw new Error('Lançamento não encontrado.')

  const totalPagoAtualizado = (lanc.valor_pago ?? 0) + valorPago
  const quitado = totalPagoAtualizado >= lanc.valor
  const today = new Date().toISOString().split('T')[0]

  const novoRegistro: PagamentoHistorico = {
    valor: valorPago,
    forma: formaPagamento,
    data: new Date().toISOString(),
  }
  const historicoAtualizado = [...((lanc.historico_pagamentos as PagamentoHistorico[] | null) ?? []), novoRegistro]

  const update: Record<string, unknown> = {
    valor_pago: totalPagoAtualizado,
    forma_pagamento: formaPagamento,
    historico_pagamentos: historicoAtualizado,
    updated_at: new Date().toISOString(),
  }
  if (quitado) {
    update.status = 'pago'
    update.data_pagamento = today
  }

  const { error } = await supabase.from('lancamentos').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  return { quitado }
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
  await requirePermissao('pdv', accessToken)
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
  await requirePermissao('pdv', accessToken)
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
