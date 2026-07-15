'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'

export interface ItemVendaParaDevolucao {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  total_item: number
  series: string[]   // IMEIs vendidos deste produto nesta venda (vazio p/ não serializado)
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
  fiado_restante: number   // quanto da venda ainda é dívida (fiado em aberto)
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

  const [vendaRes, itensRes, lancRes, seriesRes] = await Promise.all([
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
      .select('id, status, valor, valor_pago')
      .eq('tipo', 'receber')
      .eq('status', 'pendente')
      .eq('venda_id', vendaId),
    supabase
      .from('numeros_serie')
      .select('produto_id, serie')
      .eq('venda_id', vendaId)
      .eq('status', 'vendido'),
  ])

  // IMEIs vendidos agrupados por produto (aparelhos serializados desta venda)
  const seriesPorProduto: Record<string, string[]> = {}
  for (const s of (seriesRes.data ?? []) as { produto_id: string; serie: string }[]) {
    ;(seriesPorProduto[s.produto_id] ??= []).push(s.serie)
  }

  if (!vendaRes.data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vRaw = vendaRes.data as any
  const pessoaNome = (vRaw.pessoas?.nome ?? vRaw.vendedor_nome ?? null) as string | null

  const [formaRes, depositoRes] = await Promise.all([
    vRaw.forma_pagamento_id
      ? supabase.from('formas_pagamento').select('nome').eq('id', vRaw.forma_pagamento_id).maybeSingle()
      : Promise.resolve({ data: null }),
    vRaw.deposito_id
      ? supabase.from('depositos').select('nome').eq('id', vRaw.deposito_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    id: vRaw.id,
    numero: vRaw.numero ?? null,
    total: vRaw.total,
    created_at: vRaw.created_at,
    pessoa_id: (vRaw.pessoa_id ?? null) as string | null,
    pessoa_nome: pessoaNome,
    vendedor_nome: vRaw.vendedor_nome ?? null,
    deposito_id: (vRaw.deposito_id ?? null) as string | null,
    deposito_nome: (depositoRes as { data: { nome: string } | null }).data?.nome ?? null,
    forma_pagamento_nome: (formaRes as { data: { nome: string } | null }).data?.nome ?? null,
    lancamento_pendente: (lancRes.data ?? []).length > 0,
    fiado_restante: (lancRes.data ?? []).reduce(
      (s, l) => s + (((l as { valor: number | null }).valor ?? 0) - ((l as { valor_pago: number | null }).valor_pago ?? 0)),
      0,
    ),
    itens: ((itensRes.data ?? []) as unknown as {
      produto_id: string; quantidade: number; preco_unitario: number
      total_item: number; produtos: { nome: string } | null
    }[]).map((i) => ({
      produto_id: i.produto_id,
      nome: i.produtos?.nome ?? '—',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total_item: i.total_item,
      series: seriesPorProduto[i.produto_id] ?? [],
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

  // Esconde vendas já totalmente devolvidas (evita devolução dupla).
  // Soma o valor devolvido por venda e compara com o total.
  const ids = (data ?? []).map((v) => v.id as string)
  const devolvidoPorVenda: Record<string, number> = {}
  if (ids.length) {
    const { data: devs } = await supabase
      .from('devolucoes').select('venda_id, valor_total').in('venda_id', ids)
    for (const d of (devs ?? []) as { venda_id: string | null; valor_total: number | null }[]) {
      if (d.venda_id) devolvidoPorVenda[d.venda_id] = (devolvidoPorVenda[d.venda_id] ?? 0) + (d.valor_total ?? 0)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (data ?? [])
    .filter((v: any) => (devolvidoPorVenda[v.id] ?? 0) < (v.total as number) - 0.01)
    .map((v: any) => ({
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
  /** motivo FECHADO (teste | defeito_alegado | cliente_desistiu | peca_errada | outro) */
  motivo_tipo: string
  tipo_credito: string
  itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string; series?: string[] }[]
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
  // IMEIs devolvidos (aparelhos serializados) — cada um com o status escolhido
  const series = input.itens.flatMap((i) =>
    (i.series ?? []).map((serie) => ({ produto_id: i.produto_id, serie, status_produto: i.status_produto })),
  )

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
    p_series: series,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('RPC registrar_devolucao retornou vazio.')

  const devolucaoId = (data as { devolucao_id: string }).devolucao_id
  const reembolso = Number((data as { reembolso?: number }).reembolso ?? 0)

  // DINHEIRO devolvido SAI DA GAVETA — registra a saída no caixa aberto da loja.
  // O RPC já não cria lançamento financeiro pra dinheiro (migration de 15/07): o
  // dinheiro é evento de CAIXA, não conta a pagar. Aqui fechamos o outro lado —
  // sem isto, a gaveta perdia o dinheiro físico e o sistema não registrava, e o
  // fechamento acusava falta. Débito/crédito/PIX NÃO passam por aqui (não saem da
  // gaveta). Fora do RPC de propósito: uma escrita de caixa não deve reverter a
  // devolução (estoque/crédito) se der ruim — ela é secundária ao ato de devolver.
  if (input.tipo_credito === 'dinheiro' && reembolso > 0.005 && input.deposito_id) {
    const { data: dep } = await supabase.from('depositos').select('loja_id').eq('id', input.deposito_id).maybeSingle()
    const lojaId = (dep as { loja_id: string | null } | null)?.loja_id ?? null
    if (lojaId) {
      const { data: caixa } = await supabase
        .from('caixas').select('id').eq('status', 'aberto').eq('loja_id', lojaId)
        .order('aberto_em', { ascending: false }).limit(1).maybeSingle()
      const caixaId = (caixa as { id: string } | null)?.id ?? null
      if (caixaId) {
        await supabase.from('movimentos_caixa').insert({
          caixa_id: caixaId,
          tipo: 'devolucao',
          forma_pagamento: 'Dinheiro',
          valor: reembolso,
          motivo: `Devolução — ${input.pessoa_nome ?? 'Cliente'}`,
        })
      }
    }
  }

  // O motivo é um RÓTULO, não dinheiro — grava DEPOIS, fora do RPC. Não mexo no
  // registrar_devolucao (que move estoque, crédito e fiado numa transação atômica)
  // só pra carregar uma etiqueta: o risco não compensa.
  if (input.motivo_tipo) {
    await supabase.from('devolucoes').update({ motivo_tipo: input.motivo_tipo }).eq('id', devolucaoId)
  }

  return { id: devolucaoId }
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
