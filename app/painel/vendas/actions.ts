'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PagamentoDetalhe = {
  forma_nome: string
  valor: number
  parcelas: number
  maquina: string | null
}

export type DetalheVendaCompleto = {
  id: string
  numero: number | null
  total: number
  desconto: number
  created_at: string
  status: string
  observacoes: string | null
  vendedor_nome: string | null
  pessoa_id: string | null
  pessoa_nome: string | null
  pagamentos: PagamentoDetalhe[]
  itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number; desconto_item: number; total_item: number }[]
}

export async function buscarDetalheVendaPublic(vendaId: string): Promise<DetalheVendaCompleto | null> {
  await requirePermissao('vendas')
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, pagamentosRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, desconto, created_at, status, observacoes, vendedor_nome, pessoa_id')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('produto_id, quantidade, preco_unitario, desconto_item, total_item')
      .eq('venda_id', vendaId),
    supabase
      .from('pagamentos_venda')
      .select('forma_pagamento_id, valor, parcelas, maquina')
      .eq('venda_id', vendaId),
  ])

  if (!vendaRes.data) return null
  const v = vendaRes.data as {
    id: string; numero: number | null; total: number; desconto: number
    created_at: string; status: string; observacoes: string | null
    vendedor_nome: string | null; pessoa_id: string | null
  }

  // Nomes de formas de pagamento
  const formaIds = [...new Set((pagamentosRes.data ?? []).map((p: { forma_pagamento_id: string }) => p.forma_pagamento_id).filter(Boolean))]
  let formaMap: Record<string, string> = {}
  if (formaIds.length > 0) {
    const { data: formas } = await supabase.from('formas_pagamento').select('id, nome').in('id', formaIds)
    formaMap = Object.fromEntries((formas ?? []).map(f => [f.id, f.nome]))
  }

  // Nome do cliente
  let pessoaNome: string | null = null
  if (v.pessoa_id) {
    const { data: p } = await supabase.from('pessoas').select('nome').eq('id', v.pessoa_id).maybeSingle()
    pessoaNome = (p as { nome: string } | null)?.nome ?? null
  }

  // Nomes dos produtos
  const produtoIds = [...new Set((itensRes.data ?? []).map((i: { produto_id: string }) => i.produto_id).filter(Boolean))]
  let produtoMap: Record<string, string> = {}
  if (produtoIds.length > 0) {
    const { data: prods } = await supabase.from('produtos').select('id, nome').in('id', produtoIds)
    produtoMap = Object.fromEntries((prods ?? []).map(p => [p.id, p.nome]))
  }

  return {
    id: v.id,
    numero: v.numero,
    total: v.total,
    desconto: v.desconto ?? 0,
    created_at: v.created_at,
    status: v.status,
    observacoes: v.observacoes,
    vendedor_nome: v.vendedor_nome,
    pessoa_id: v.pessoa_id,
    pessoa_nome: pessoaNome,
    pagamentos: (pagamentosRes.data ?? []).map((p: { forma_pagamento_id: string; valor: number; parcelas: number; maquina: string | null }) => ({
      forma_nome: formaMap[p.forma_pagamento_id] ?? p.forma_pagamento_id,
      valor: p.valor,
      parcelas: p.parcelas ?? 1,
      maquina: p.maquina,
    })),
    itens: (itensRes.data ?? []).map((i: { produto_id: string; quantidade: number; preco_unitario: number; desconto_item: number; total_item: number }) => ({
      produto_id: i.produto_id,
      nome: produtoMap[i.produto_id] ?? '—',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      desconto_item: i.desconto_item ?? 0,
      total_item: i.total_item,
    })),
  }
}

// ============================================================
// CANCELAR VENDA — a venda não deveria ter existido (erro de digitação, teste,
// desistência antes de entregar). Diferente da Devolução, que é o cliente trazendo
// a peça de volta e virando crédito/reembolso.
//
// Tudo dentro do RPC cancelar_venda (atômico): devolve estoque, devolve IMEIs,
// apaga os lançamentos (sai do A Receber/caixa), estorna o crédito usado e marca
// a venda como 'cancelada'. A venda NÃO é apagada — fica no histórico.
//
// Idempotente: cancelar 2x não devolve estoque em dobro (o RPC recusa a 2ª).
// ============================================================
export type ResultadoCancelamento =
  | { ok: true; jaCancelada: boolean; numero: number | null; estoqueDevolvido: number; imeis: number; creditoEstornado: number }
  | { ok: false; erro: string }

export async function cancelarVenda(vendaId: string, motivo: string): Promise<ResultadoCancelamento> {
  await requirePermissao('vendas')
  const supabase = await createServiceClient()

  const { data, error } = await supabase.rpc('cancelar_venda', {
    p_venda_id: vendaId,
    p_motivo: motivo?.trim() || null,
  })
  if (error) return { ok: false, erro: error.message }

  const d = (data ?? {}) as {
    ja_cancelada?: boolean
    venda_numero?: number | null
    estoque_devolvido?: number
    imeis_devolvidos?: number
    credito_estornado?: number
  }
  revalidatePath('/painel/vendas')
  revalidatePath('/painel/estoque')
  revalidatePath('/painel/financeiro')
  revalidatePath('/painel')
  return {
    ok: true,
    jaCancelada: !!d.ja_cancelada,
    numero: d.venda_numero ?? null,
    estoqueDevolvido: Number(d.estoque_devolvido) || 0,
    imeis: Number(d.imeis_devolvidos) || 0,
    creditoEstornado: Number(d.credito_estornado) || 0,
  }
}
