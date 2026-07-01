'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'

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
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, lancRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, created_at, vendedor_nome, forma_pagamento_id, pessoa_id, deposito_id, pessoas!pessoa_id(nome)')
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
    deposito_id: (vRaw.deposito_id ?? null) as string | null,
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
  await requirePermissao('devolucoes', accessToken)
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
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()

  // Tudo numa transação atômica no RPC (migration 2026-07-03): devolução + itens +
  // retorno ao estoque + financeiro. Falha em qualquer passo reverte o conjunto —
  // sem devolução órfã nem estoque retornado pela metade.
  const { data, error } = await supabase.rpc('registrar_devolucao', {
    p_venda_id: input.venda_id,
    p_deposito_id: input.deposito_id,
    p_pessoa_id: input.pessoa_id,
    p_pessoa_nome: input.pessoa_nome,
    p_vendedor_nome: input.vendedor_nome,
    p_motivo: input.motivo,
    p_tipo_credito: input.tipo_credito,
    p_itens: input.itens,
    p_lancamento_pendente: input.lancamento_pendente,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('RPC registrar_devolucao retornou vazio.')

  return { id: (data as { devolucao_id: string }).devolucao_id }
}

export async function buscarItensDevolucao(
  accessToken: string,
  devolucaoId: string,
): Promise<{ nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]> {
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('itens_devolucao')
    .select('nome, quantidade, preco_unitario, total_item, status_produto')
    .eq('devolucao_id', devolucaoId)
  return (data ?? []) as { nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]
}
