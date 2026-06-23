import { createServiceClient } from '@/lib/supabase/server'
import { OperacaoClient } from './OperacaoClient'

export default async function OperacaoPDVPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()

  // Caixa atual + histórico + formas em paralelo
  const [caixaResult, historicoResult, formasResult] = await Promise.all([
    supabase
      .from('caixas')
      .select('id, aberto_em, valor_abertura, status')
      .eq('status', 'aberto')
      .order('aberto_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('caixas')
      .select('id, aberto_em, fechado_em, valor_abertura, valor_fechamento, status')
      .order('aberto_em', { ascending: false })
      .limit(20),
    supabase
      .from('formas_pagamento')
      .select('nome')
      .eq('ativo', true)
      .order('nome'),
  ])

  const caixaAberto = caixaResult.data ?? null
  const historico = historicoResult.data ?? []
  const formas = (formasResult.data ?? []).map((f) => f.nome as string)

  let totalVendas = 0
  let totalCrediario = 0
  let totalReforcos = 0
  let totalRetiradas = 0
  const totalDevolucoes = 0
  let qtdVendas = 0
  let movimentos: {
    id: string
    tipo: string
    motivo: string | null
    forma_pagamento: string
    valor: number
    created_at: string
  }[] = []
  let vendasDia: { id: string; total: number; created_at: string }[] = []
  let porProduto: Record<string, { nome: string; qtd: number; total: number }> = {}

  if (caixaAberto) {
    // Vendas, crediário e movimentos em paralelo
    const [vendasResult, lancCrediarioResult, movResult] = await Promise.all([
      supabase
        .from('vendas')
        .select('id, total, created_at')
        .eq('status', 'concluida')
        .gte('created_at', caixaAberto.aberto_em)
        .order('created_at', { ascending: false }),
      supabase
        .from('lancamentos')
        .select('valor')
        .eq('tipo', 'receber')
        .eq('status', 'pendente')
        .gte('created_at', caixaAberto.aberto_em),
      supabase
        .from('movimentos_caixa')
        .select('id, tipo, motivo, forma_pagamento, valor, created_at')
        .eq('caixa_id', caixaAberto.id)
        .order('created_at', { ascending: false }),
    ])

    vendasDia = vendasResult.data ?? []
    qtdVendas = vendasDia.length
    totalVendas = vendasDia.reduce((s, v) => s + (v.total ?? 0), 0)
    totalCrediario = (lancCrediarioResult.data ?? []).reduce((s, l) => s + (l.valor ?? 0), 0)

    movimentos = movResult.data ?? []
    totalReforcos = movimentos.filter((m) => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0)
    totalRetiradas = movimentos.filter((m) => m.tipo === 'retirada').reduce((s, m) => s + m.valor, 0)

    // Itens vendidos depende de vendasDia, roda separado
    if (vendasDia.length > 0) {
      const { data: itens } = await supabase
        .from('itens_venda')
        .select('produto_id, quantidade, total_item, produtos(nome)')
        .in('venda_id', vendasDia.map((v) => v.id))

      for (const i of (itens ?? []) as {
        produto_id: string
        quantidade: number
        total_item: number
        produtos: { nome: string } | null
      }[]) {
        const key = i.produto_id
        if (!porProduto[key]) porProduto[key] = { nome: i.produtos?.nome ?? key, qtd: 0, total: 0 }
        porProduto[key].qtd += i.quantidade
        porProduto[key].total += i.total_item
      }
    }
  }

  return (
    <OperacaoClient
      caixaAberto={caixaAberto as {
        id: string
        aberto_em: string
        valor_abertura: number
        status: string
      } | null}
      totalVendas={totalVendas}
      totalCrediario={totalCrediario}
      totalReforcos={totalReforcos}
      totalRetiradas={totalRetiradas}
      totalDevolucoes={totalDevolucoes}
      qtdVendas={qtdVendas}
      movimentos={movimentos}
      historico={historico as {
        id: string
        aberto_em: string
        fechado_em: string | null
        valor_abertura: number
        valor_fechamento: number | null
        status: string
      }[]}
      vendasDia={vendasDia}
      porProduto={porProduto}
      formas={formas.length > 0 ? formas : ['Dinheiro', 'PIX', 'Cartão de Débito', 'Cartão de Crédito']}
      erro={erro}
    />
  )
}
