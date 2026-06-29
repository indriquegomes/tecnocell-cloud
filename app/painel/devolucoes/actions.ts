'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'

export interface ItemVendaParaDevolucao {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  total_item: number
}

export interface VendaParaDevolucao {
  id: string
  numero: number | null
  total: number
  created_at: string
  pessoa_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  deposito_id: string | null
  deposito_nome: string | null
  forma_pagamento_nome: string | null
  lancamento_pendente: boolean
  itens: ItemVendaParaDevolucao[]
}

export interface DevolucaoResumo {
  id: string
  venda_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  valor_total: number
  tipo_credito: string
  motivo: string | null
  created_at: string
}

export interface VendaResumo {
  id: string
  numero: number | null
  pessoa_nome: string | null
  total: number
  created_at: string
}

export async function buscarVendaParaDevolucao(
  accessToken: string,
  vendaId: string,
): Promise<VendaParaDevolucao | null> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, lancRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, created_at, vendedor_nome, forma_pagamento_id, pessoa_id, pessoas!pessoa_id(nome)')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produto_id, produtos(nome)')
      .eq('venda_id', vendaId),
    supabase
      .from('lancamentos')
      .select('id, status')
      .eq('tipo', 'receber')
      .eq('status', 'pendente')
      .eq('venda_id', vendaId),
  ])

  if (!vendaRes.data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vRaw = vendaRes.data as any
  const pessoaNome = (vRaw.pessoas?.nome ?? vRaw.vendedor_nome ?? null) as string | null

  const formaRes = vRaw.forma_pagamento_id
    ? await supabase.from('formas_pagamento').select('nome').eq('id', vRaw.forma_pagamento_id).maybeSingle()
    : { data: null }

  return {
    id: vRaw.id,
    numero: vRaw.numero ?? null,
    total: vRaw.total,
    created_at: vRaw.created_at,
    pessoa_id: (vRaw.pessoa_id ?? null) as string | null,
    pessoa_nome: pessoaNome,
    vendedor_nome: vRaw.vendedor_nome ?? null,
    deposito_id: null,
    deposito_nome: null,
    forma_pagamento_nome: (formaRes as { data: { nome: string } | null }).data?.nome ?? null,
    lancamento_pendente: (lancRes.data ?? []).length > 0,
    itens: ((itensRes.data ?? []) as unknown as {
      produto_id: string; quantidade: number; preco_unitario: number
      total_item: number; produtos: { nome: string } | null
    }[]).map((i) => ({
      produto_id: i.produto_id,
      nome: i.produtos?.nome ?? '—',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total_item: i.total_item,
    })),
  }
}

export async function buscarVendasRecentes(
  accessToken: string,
  busca: string,
): Promise<VendaResumo[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('vendas')
    .select('id, numero, total, created_at, vendedor_nome, pessoa_id, pessoas!pessoa_id(nome)')
    .eq('status', 'concluida')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (data ?? []).map((v: any) => ({
    id: v.id as string,
    numero: v.numero as number | null,
    pessoa_nome: (v.pessoas?.nome ?? v.vendedor_nome ?? null) as string | null,
    total: v.total as number,
    created_at: v.created_at as string,
  }))

  if (busca.trim()) {
    const b = busca.toLowerCase().trim()
    const isNum = /^\d+$/.test(b)
    rows = rows.filter((v) =>
      v.pessoa_nome?.toLowerCase().includes(b) ||
      (isNum && v.numero?.toString() === b)
    )
  }

  return rows
}

export interface RegistrarDevolucaoInput {
  venda_id: string
  deposito_id: string | null
  pessoa_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  motivo: string
  tipo_credito: string
  itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]
  lancamento_pendente: boolean
}

export async function registrarDevolucao(
  accessToken: string,
  input: RegistrarDevolucaoInput,
): Promise<{ id: string }> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()

  const valorTotal = input.itens.reduce((s, i) => s + i.total_item, 0)
  const devolucaoId = crypto.randomUUID()

  const { error: eDev } = await supabase.from('devolucoes').insert({
    id: devolucaoId,
    venda_id: input.venda_id,
    deposito_id: input.deposito_id,
    pessoa_nome: input.pessoa_nome ?? 'Cliente Final',
    vendedor_nome: input.vendedor_nome ?? null,
    motivo: input.motivo || null,
    valor_total: valorTotal,
    tipo_credito: input.tipo_credito,
    status: 'concluida',
  })
  if (eDev) throw new Error(eDev.message)

  const { error: eItens } = await supabase.from('itens_devolucao').insert(
    input.itens.map((i) => ({
      devolucao_id: devolucaoId,
      produto_id: i.produto_id,
      nome: i.nome,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total_item: i.total_item,
      status_produto: i.status_produto ?? 'ok',
    }))
  )
  if (eItens) throw new Error(eItens.message)

  // Retorno ao estoque — tenta DEP001 como fallback se deposito_id for null
  const depositoEstoque = input.deposito_id ?? 'DEP001'
  for (const item of input.itens) {
    const { error: eEstoque } = await supabase.rpc('incrementar_estoque', {
      p_produto_id: item.produto_id,
      p_deposito_id: depositoEstoque,
      p_quantidade: item.quantidade,
    })
    if (eEstoque) throw new Error(`Falha ao retornar ${item.nome} ao estoque: ${eEstoque.message}`)
  }

  // Tratamento financeiro
  if (input.lancamento_pendente) {
    await supabase
      .from('lancamentos')
      .update({ status: 'cancelado' })
      .eq('venda_id', input.venda_id)
      .eq('status', 'pendente')
  } else if (input.tipo_credito === 'credito_conta') {
    if (input.pessoa_id) {
      await supabase.from('creditos_clientes').insert({
        pessoa_id: input.pessoa_id,
        pessoa_nome: input.pessoa_nome ?? 'Cliente',
        valor: valorTotal,
        tipo: 'credito',
        descricao: `Devolução de compra`,
        devolucao_id: devolucaoId,
      })
    }
  } else if (input.tipo_credito !== 'sem_reembolso') {
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('lancamentos').insert({
      id: crypto.randomUUID(),
      tipo: 'pagar',
      descricao: `Devolução — ${input.pessoa_nome ?? 'Cliente'}`,
      valor: valorTotal,
      status: 'pago',
      data_vencimento: today,
      data_pagamento: today,
      forma_pagamento: input.tipo_credito,
      pessoa_nome: input.pessoa_nome,
    })
  }

  return { id: devolucaoId }
}

export async function buscarItensDevolucao(
  accessToken: string,
  devolucaoId: string,
): Promise<{ nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('itens_devolucao')
    .select('nome, quantidade, preco_unitario, total_item, status_produto')
    .eq('devolucao_id', devolucaoId)
  return (data ?? []) as { nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]
}
