import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { OperacaoClient } from './OperacaoClient'

export default async function OperacaoPDVPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; fechado?: string; aberto?: string; esperado?: string; contado?: string; loja?: string }>
}) {
  const { erro, fechado, aberto, esperado, contado, loja } = await searchParams
  const supabase = await createServiceClient()

  // Loja atual (caixa é por loja): ?loja=<id> ou a 1ª loja ativa
  const { data: lojasData } = await supabase.from('lojas').select('id, nome').eq('ativa', true).order('nome')
  const lojas = lojasData ?? []
  const lojaAtual = (loja && lojas.some((l) => l.id === loja)) ? loja : (lojas[0]?.id ?? '')

  // Caixa atual (da loja) + histórico + formas em paralelo
  const [caixaResult, historicoResult, formasResult] = await Promise.all([
    supabase
      .from('caixas')
      .select('id, aberto_em, valor_abertura, status')
      .eq('status', 'aberto')
      .eq('loja_id', lojaAtual)
      .order('aberto_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('caixas')
      .select('id, aberto_em, fechado_em, valor_abertura, valor_fechamento, status')
      .eq('loja_id', lojaAtual)
      .order('aberto_em', { ascending: false })
      .limit(20),
    supabase
      .from('formas_pagamento')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome'),
  ])

  const caixaAberto = caixaResult.data ?? null
  // Exclui o caixa aberto atual do histórico (evita exibir duplicado)
  const historico = (historicoResult.data ?? []).filter((c) => c.id !== caixaAberto?.id)
  const formasData = formasResult.data ?? []
  const formas = formasData.map((f) => f.nome as string)
  const formasPorId: Record<string, string> = Object.fromEntries(formasData.map((f) => [f.id, f.nome]))

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
  let vendasDia: { id: string; total: number; created_at: string; forma_pagamento_id: string | null; forma_pagamento: string }[] = []
  let porProduto: Record<string, { nome: string; qtd: number; total: number }> = {}
  let porForma: Record<string, number> = {}

  if (caixaAberto) {
    // Vendas, crediário e movimentos em paralelo
    const [vendasResult, lancCrediarioResult, movResult] = await Promise.all([
      supabase
        .from('vendas')
        .select('id, total, created_at, forma_pagamento_id')
        .eq('status', 'concluida')
        .eq('caixa_id', caixaAberto.id)
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

    const vendasRaw = vendasResult.data ?? []
    vendasDia = vendasRaw.map((v) => {
      const raw = formasPorId[v.forma_pagamento_id ?? ''] ?? 'Outras'
      const forma = raw.toLowerCase().includes('cart') ? 'Cartão' : raw
      return { ...v, forma_pagamento: forma }
    })
    qtdVendas = vendasDia.length
    totalVendas = vendasDia.reduce((s, v) => s + (v.total ?? 0), 0)
    totalCrediario = (lancCrediarioResult.data ?? []).reduce((s, l) => s + (l.valor ?? 0), 0)

    // Vendas por forma de pagamento — cartões unificados
    for (const v of vendasDia) {
      porForma[v.forma_pagamento] = (porForma[v.forma_pagamento] ?? 0) + (v.total ?? 0)
    }

    movimentos = movResult.data ?? []
    totalReforcos = movimentos.filter((m) => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0)
    totalRetiradas = movimentos.filter((m) => m.tipo === 'retirada').reduce((s, m) => s + m.valor, 0)

    // Itens vendidos depende de vendasDia, roda separado
    if (vendasDia.length > 0) {
      const { data: itens } = await supabase
        .from('itens_venda')
        .select('produto_id, quantidade, total_item, produtos(nome)')
        .in('venda_id', vendasDia.map((v) => v.id))

      for (const i of (itens ?? []) as unknown as {
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

  // Quando caixa acaba de fechar, busca dados completos do Z Report
  let zReport: {
    aberto_em: string
    fechado_em: string
    valor_abertura: number
    obs_fechamento: string | null
    totalVendas: number
    qtdVendas: number
    totalReforcos: number
    totalRetiradas: number
    totalCrediario: number
    porForma: Record<string, number>
    movimentos: { tipo: string; motivo: string | null; forma_pagamento: string; valor: number; created_at: string }[]
    valorEsperado: number
    valorContado: number
    operador: string
  } | null = null

  if (fechado === '1' && esperado && contado) {
    const [userResult, ultimoCaixaResult] = await Promise.all([
      requireAuth().catch(() => null),
      supabase
        .from('caixas')
        .select('id, aberto_em, fechado_em, valor_abertura, obs_fechamento')
        .eq('status', 'fechado')
        .eq('loja_id', lojaAtual)
        .order('fechado_em', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const ultimoCaixa = ultimoCaixaResult.data
    if (ultimoCaixa) {
      const [zVendasResult, zMovResult, zLancResult] = await Promise.all([
        supabase
          .from('vendas')
          .select('id, total, forma_pagamento_id')
          .eq('status', 'concluida')
          .eq('caixa_id', ultimoCaixa.id),
        supabase
          .from('movimentos_caixa')
          .select('tipo, motivo, forma_pagamento, valor, created_at')
          .eq('caixa_id', ultimoCaixa.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('lancamentos')
          .select('valor')
          .eq('tipo', 'receber')
          .eq('status', 'pendente')
          .gte('created_at', ultimoCaixa.aberto_em)
          .lte('created_at', ultimoCaixa.fechado_em ?? new Date().toISOString()),
      ])

      const zVendas = zVendasResult.data ?? []
      const zMov = zMovResult.data ?? []
      const zPorForma: Record<string, number> = {}
      for (const v of zVendas) {
        const raw = formasPorId[v.forma_pagamento_id ?? ''] ?? v.forma_pagamento_id ?? 'Outras'
        const forma = raw.toLowerCase().includes('cart') ? 'Cartão' : raw
        zPorForma[forma] = (zPorForma[forma] ?? 0) + (v.total ?? 0)
      }

      zReport = {
        aberto_em: ultimoCaixa.aberto_em,
        fechado_em: ultimoCaixa.fechado_em ?? new Date().toISOString(),
        valor_abertura: ultimoCaixa.valor_abertura,
        obs_fechamento: ultimoCaixa.obs_fechamento ?? null,
        totalVendas: zVendas.reduce((s, v) => s + (v.total ?? 0), 0),
        qtdVendas: zVendas.length,
        totalReforcos: zMov.filter((m) => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0),
        totalRetiradas: zMov.filter((m) => m.tipo === 'retirada').reduce((s, m) => s + m.valor, 0),
        totalCrediario: (zLancResult.data ?? []).reduce((s, l) => s + (l.valor ?? 0), 0),
        porForma: zPorForma,
        movimentos: zMov,
        valorEsperado: parseFloat(esperado),
        valorContado: parseFloat(contado),
        operador: userResult?.email ?? '—',
      }
    }
  }

  return (
    <OperacaoClient
      lojas={lojas}
      lojaAtual={lojaAtual}
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
      porForma={porForma}
      erro={erro}
      fechado={fechado === '1'}
      aberto={aberto === '1'}
      zReport={zReport}
    />
  )
}
