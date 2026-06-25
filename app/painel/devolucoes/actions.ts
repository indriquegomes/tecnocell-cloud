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
  total: number
  created_at: string
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

export async function buscarVendaParaDevolucao(
  accessToken: string,
  vendaId: string,
): Promise<VendaParaDevolucao | null> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, lancRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, total, created_at, vendedor_nome, deposito_id, forma_pagamento_id, pessoa_id, pessoas!pessoa_id(nome)')
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
      // busca por venda_id linkado ou por lancamentos criados proximos à venda
      .or(`venda_id.eq.${vendaId}`),
  ])

  if (!vendaRes.data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vRaw = vendaRes.data as any
  const pessoaNome = (vRaw.pessoas?.nome ?? vRaw.vendedor_nome ?? null) as string | null
  const v = { ...vRaw, pessoa_nome: pessoaNome } as {
    id: string; total: number; created_at: string
    pessoa_nome: string | null; vendedor_nome: string | null
    deposito_id: string | null; forma_pagamento_id: string | null
  }

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
    total: v.total,
    created_at: v.created_at,
    pessoa_nome: v.pessoa_nome ?? null,
    vendedor_nome: v.vendedor_nome ?? null,
    deposito_id: v.deposito_id ?? null,
    deposito_nome: (depositoRes as { data: { nome: string } | null }).data?.nome ?? null,
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
): Promise<{ id: string; pessoa_nome: string | null; total: number; created_at: string }[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('vendas')
    .select('id, total, created_at, vendedor_nome, pessoa_id, pessoas!pessoa_id(nome)')
    .eq('status', 'concluida')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  let result = rows.map((v) => ({
    id: v.id as string,
    pessoa_nome: (v.pessoas?.nome ?? v.vendedor_nome ?? null) as string | null,
    total: v.total as number,
    created_at: v.created_at as string,
  }))

  if (busca.trim()) {
    const b = busca.toLowerCase()
    result = result.filter(v => v.pessoa_nome?.toLowerCase().includes(b))
  }

  return result
}

export interface RegistrarDevolucaoInput {
  venda_id: string
  deposito_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  motivo: string
  tipo_credito: string
  itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number; total_item: number }[]
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

  // 1. Cria devolucao
  const { error: eDev } = await supabase.from('devolucoes').insert({
    id: devolucaoId,
    venda_id: input.venda_id,
    deposito_id: input.deposito_id,
    pessoa_nome: input.pessoa_nome,
    vendedor_nome: input.vendedor_nome,
    motivo: input.motivo || null,
    valor_total: valorTotal,
    tipo_credito: input.tipo_credito,
    status: 'concluida',
  })
  if (eDev) throw new Error(eDev.message)

  // 2. Cria itens da devolucao
  const { error: eItens } = await supabase.from('itens_devolucao').insert(
    input.itens.map((i) => ({
      devolucao_id: devolucaoId,
      produto_id: i.produto_id,
      nome: i.nome,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total_item: i.total_item,
    }))
  )
  if (eItens) throw new Error(eItens.message)

  // 3. Devolve ao estoque (não-crítico, não quebra se falhar)
  if (input.deposito_id) {
    for (const item of input.itens) {
      await supabase.rpc('incrementar_estoque', {
        p_produto_id: item.produto_id,
        p_deposito_id: input.deposito_id,
        p_quantidade: item.quantidade,
      }).then(() => {})
    }
  }

  // 4. Tratamento financeiro
  if (input.lancamento_pendente) {
    // Crediário pendente: cancela o lancamento, sem reembolso
    await supabase
      .from('lancamentos')
      .update({ status: 'cancelado', updated_at: new Date().toISOString() })
      .eq('venda_id', input.venda_id)
      .eq('status', 'pendente')
      .then(() => {})
  } else if (input.tipo_credito !== 'sem_reembolso') {
    // Venda já paga: gera lancamento de saída (reembolso)
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('lancamentos').insert({
      tipo: 'pagar',
      descricao: `Devolução — ${input.pessoa_nome ?? 'Cliente'}`,
      valor: valorTotal,
      status: 'pago',
      data_vencimento: today,
      data_pagamento: today,
      forma_pagamento: input.tipo_credito,
      pessoa_nome: input.pessoa_nome,
    }).then(() => {})
  }

  return { id: devolucaoId }
}

export async function buscarDevolucoes(accessToken: string): Promise<DevolucaoResumo[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('devolucoes')
    .select('id, venda_id, pessoa_nome, vendedor_nome, valor_total, tipo_credito, motivo, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []) as DevolucaoResumo[]
}

export async function buscarItensDevolucao(
  accessToken: string,
  devolucaoId: string,
): Promise<{ nome: string; quantidade: number; preco_unitario: number; total_item: number }[]> {
  await requireAuth(accessToken)
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('itens_devolucao')
    .select('nome, quantidade, preco_unitario, total_item')
    .eq('devolucao_id', devolucaoId)
  return (data ?? []) as { nome: string; quantidade: number; preco_unitario: number; total_item: number }[]
}
