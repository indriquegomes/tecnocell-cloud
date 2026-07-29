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
    // TODAS as formas (inclusive inativas): uma venda antiga paga com uma forma que
    // depois foi desativada precisa continuar aparecendo com o nome e o TIPO certos —
    // senão vira "Outras" e some da linha de cartão do fechamento (dinheiro sumindo
    // da conferência). O filtro de ativas fica só na lista de reforço/retirada.
    supabase
      .from('formas_pagamento')
      .select('id, nome, tipo, ativo')
      .order('nome'),
  ])

  const caixaAberto = caixaResult.data ?? null
  // Exclui o caixa aberto atual do histórico (evita exibir duplicado)
  const historico = (historicoResult.data ?? []).filter((c) => c.id !== caixaAberto?.id)
  const formasData = formasResult.data ?? []
  const formas = formasData.filter((f) => f.ativo).map((f) => f.nome as string)
  const formasPorId: Record<string, string> = Object.fromEntries(formasData.map((f) => [f.id, f.nome]))
  const tipoPorId: Record<string, string> = Object.fromEntries(formasData.map((f) => [f.id, (f.tipo as string) ?? 'outros']))
  // movimentos_caixa guardam o NOME da forma (texto), não o id
  const tipoPorNome: Record<string, string> = Object.fromEntries(
    formasData.map((f) => [(f.nome as string ?? '').toLowerCase(), (f.tipo as string) ?? 'outros']),
  )
  const tipoDoTexto = (txt: string | null) => {
    const t = (txt ?? '').trim().toLowerCase()
    if (tipoPorNome[t]) return tipoPorNome[t]
    if (t.includes('dinheiro')) return 'dinheiro'
    if (t.includes('pix')) return 'pix'
    if (t.includes('cr')) return 'cartao_credito'
    if (t.includes('deb') || t.includes('déb')) return 'cartao_debito'
    return 'outros'
  }



  let totalVendas = 0
  let totalCrediario = 0
  let totalReforcos = 0
  let totalRetiradas = 0
  let reforcosDinheiro = 0
  let retiradasDinheiro = 0
  let recebidosDinheiro = 0   // fiado recebido em espécie — entra na gaveta
  let totalDevolucoes = 0
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
  let porForma: Record<string, number> = {}
  let porTipo: Record<string, number> = {}
  // vendas de cada tipo, pra conferência (bater comprovante de PIX com a venda)
  const vendasPorTipo: Record<string, { id: string; numero: number | null; hora: string; cliente: string | null; valorForma: number; totalVenda: number; fiado?: boolean }[]> = {}
  let vendasDetalhe: { id: string; numero: number | null; hora: string; cliente: string | null; total: number; pagamentos: { nome: string; tipo: string; valor: number }[] }[] = []

  if (caixaAberto) {
    const [vendasResult, movResult] = await Promise.all([
      supabase
        .from('vendas')
        .select('id, numero, total, created_at, forma_pagamento_id, pessoa_id')
        .eq('status', 'concluida')
        .eq('caixa_id', caixaAberto.id)
        .order('created_at', { ascending: false }),
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

    // A verdade dos recebimentos é pagamentos_venda (venda mista = 2+ linhas),
    // NÃO vendas.forma_pagamento_id (1 forma por venda — atribuía a venda inteira
    // à primeira forma). Classificado pelo TIPO da forma, porque o fechamento da
    // loja confere cada tipo num lugar: dinheiro na gaveta, PIX no WhatsApp,
    // cartão na maquininha, fiado não é dinheiro.
    if (vendasRaw.length > 0) {
      const [pagsRes, pessoasRes, fiadoCancRes] = await Promise.all([
        supabase
          .from('pagamentos_venda')
          .select('venda_id, forma_pagamento_id, valor')
          .in('venda_id', vendasRaw.map((v) => v.id)),
        supabase
          .from('pessoas')
          .select('id, nome')
          .in('id', [...new Set(vendasRaw.map((v) => v.pessoa_id).filter(Boolean))] as string[]),
        // Fiado DEVOLVIDO/cancelado não é mais dívida → não pode somar no caixa. O
        // lançamento é a verdade (a devolução cancela ele), mas o pagamentos_venda fica
        // — por isso o fiado cancelado "voltava" como fantasma no total (Isa 29/07).
        supabase
          .from('lancamentos')
          .select('venda_id, valor')
          .eq('status', 'cancelado')
          .ilike('descricao', '%Fiado%')
          .in('venda_id', vendasRaw.map((v) => v.id)),
      ])
      const fiadoCancelado = new Set((fiadoCancRes.data ?? []).map((l) => l.venda_id as string))
      // ...e o fiado cancelado também sai do TOTAL de vendas / total do turno — não só do
      // "por forma". Senão o R$ do fiado devolvido ficava fantasma no total (Isa 29/07).
      totalVendas -= (fiadoCancRes.data ?? []).reduce((s, l) => s + Number((l as { valor: number | null }).valor ?? 0), 0)
      const nomePessoa: Record<string, string> = Object.fromEntries((pessoasRes.data ?? []).map((p) => [p.id, p.nome]))
      const vendaPorId = Object.fromEntries(vendasRaw.map((v) => [v.id, v]))

      // Uma linha por VENDA, com as formas que a pagaram. É o que o operador confere —
      // "Itens Vendidos" (produto x qtd) não serve pra bater caixa: o comprovante é da venda.
      const pagsDaVenda: Record<string, { nome: string; tipo: string; valor: number }[]> = {}
      for (const pg of pagsRes.data ?? []) {
        const tp = tipoPorId[pg.forma_pagamento_id ?? ''] ?? 'outros'
        if (tp === 'fiado' && fiadoCancelado.has(pg.venda_id)) continue   // fiado cancelado não aparece
        if (!pagsDaVenda[pg.venda_id]) pagsDaVenda[pg.venda_id] = []
        pagsDaVenda[pg.venda_id].push({
          nome: formasPorId[pg.forma_pagamento_id ?? ''] ?? 'Outras',
          tipo: tp,
          valor: pg.valor ?? 0,
        })
      }
      vendasDetalhe = vendasRaw.map((v) => ({
        id: v.id,
        numero: v.numero ?? null,
        hora: v.created_at,
        cliente: v.pessoa_id ? (nomePessoa[v.pessoa_id] ?? null) : null,
        total: v.total ?? 0,
        pagamentos: pagsDaVenda[v.id] ?? [],
      }))

      for (const pg of pagsRes.data ?? []) {
        const nome = formasPorId[pg.forma_pagamento_id ?? ''] ?? 'Outras'
        const tipo = tipoPorId[pg.forma_pagamento_id ?? ''] ?? 'outros'
        if (tipo === 'fiado' && fiadoCancelado.has(pg.venda_id)) continue   // fiado devolvido não conta no caixa
        const valor = pg.valor ?? 0
        porForma[nome] = (porForma[nome] ?? 0) + valor
        porTipo[tipo] = (porTipo[tipo] ?? 0) + valor

        // Lista de CONFERÊNCIA: a Duda bate comprovante por comprovante. Pra isso ela
        // precisa da VENDA (nº, hora, cliente) e de quanto DAQUELA forma entrou nela —
        // numa venda mista só o pedaço do PIX bate com o comprovante do PIX.
        const v = vendaPorId[pg.venda_id]
        if (!v) continue
        if (!vendasPorTipo[tipo]) vendasPorTipo[tipo] = []
        vendasPorTipo[tipo].push({
          id: v.id,
          numero: v.numero ?? null,
          hora: v.created_at,
          cliente: v.pessoa_id ? (nomePessoa[v.pessoa_id] ?? null) : null,
          valorForma: valor,
          totalVenda: v.total ?? 0,
        })
      }
      for (const t of Object.keys(vendasPorTipo)) {
        vendasPorTipo[t].sort((a, b) => a.hora.localeCompare(b.hora))
      }
    }
    // Fiado DESTE caixa (antes vinha de lancamentos por created_at — pegava fiado
    // de qualquer loja e até lançamento manual sem venda)
    totalCrediario = porTipo['fiado'] ?? 0

    movimentos = movResult.data ?? []
    totalReforcos = movimentos.filter((m) => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0)
    totalRetiradas = movimentos.filter((m) => m.tipo === 'retirada').reduce((s, m) => s + m.valor, 0)
    // Reforço/sangria só mexem na GAVETA quando são em dinheiro (dá pra sangrar PIX, e
    // isso não tira cédula nenhuma)
    const ehDin = (m: { forma_pagamento: string }) => tipoDoTexto(m.forma_pagamento) === 'dinheiro'
    reforcosDinheiro = movimentos.filter((m) => m.tipo === 'reforco' && ehDin(m)).reduce((s, m) => s + m.valor, 0)
    retiradasDinheiro = movimentos.filter((m) => m.tipo === 'retirada' && ehDin(m)).reduce((s, m) => s + m.valor, 0)
    // DEVOLUÇÃO em dinheiro — cédula que SAIU da gaveta pro cliente. O saldo já
    // subtrai totalDevolucoes; este era o gancho que faltava ligar (vinha 0).
    totalDevolucoes = movimentos.filter((m) => m.tipo === 'devolucao' && ehDin(m)).reduce((s, m) => s + m.valor, 0)

    // FIADO RECEBIDO — dinheiro que entrou sem ser venda. Antes não entrava em lugar
    // nenhum: a gaveta tinha R$50 a mais e o fechamento acusava SOBRA falsa.
    for (const m of movimentos.filter((x) => x.tipo === 'recebimento')) {
      const t = tipoDoTexto(m.forma_pagamento)
      const v = Number(m.valor) || 0
      if (t === 'dinheiro') {
        recebidosDinheiro += v            // entra na gaveta
      } else {
        porTipo[t] = (porTipo[t] ?? 0) + v   // PIX/cartão: aparece na linha do tipo, pra conferir
        porForma[m.forma_pagamento] = (porForma[m.forma_pagamento] ?? 0) + v
      }
      // na lista de conferência ele aparece como linha do tipo, marcado como fiado
      if (!vendasPorTipo[t]) vendasPorTipo[t] = []
      vendasPorTipo[t].push({
        id: m.id, numero: null, hora: m.created_at,
        cliente: (m.motivo ?? '').replace(/^Fiado recebido — /, '') || 'Fiado',
        valorForma: v, totalVenda: v, fiado: true,
      })
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
    porTipo: Record<string, number>
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
      const [zVendasResult, zMovResult] = await Promise.all([
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
      ])

      const zVendas = zVendasResult.data ?? []
      const zMov = zMovResult.data ?? []
      // Mesma verdade do caixa aberto: pagamentos_venda classificado por tipo
      const zPorForma: Record<string, number> = {}
      const zPorTipo: Record<string, number> = {}
      let zFiadoCancValor = 0   // fiado cancelado/devolvido — sai do por-forma E do total
      if (zVendas.length > 0) {
        const [zPagsRes, zFiadoCancRes] = await Promise.all([
          supabase
            .from('pagamentos_venda')
            .select('venda_id, forma_pagamento_id, valor')
            .in('venda_id', zVendas.map((v) => v.id)),
          // mesmo motivo do caixa aberto: fiado cancelado/devolvido não conta
          supabase
            .from('lancamentos')
            .select('venda_id, valor')
            .eq('status', 'cancelado')
            .ilike('descricao', '%Fiado%')
            .in('venda_id', zVendas.map((v) => v.id)),
        ])
        const zFiadoCancelado = new Set((zFiadoCancRes.data ?? []).map((l) => l.venda_id as string))
        zFiadoCancValor = (zFiadoCancRes.data ?? []).reduce((s, l) => s + Number((l as { valor: number | null }).valor ?? 0), 0)
        for (const pg of zPagsRes.data ?? []) {
          const nome = formasPorId[pg.forma_pagamento_id ?? ''] ?? 'Outras'
          const tipo = tipoPorId[pg.forma_pagamento_id ?? ''] ?? 'outros'
          if (tipo === 'fiado' && zFiadoCancelado.has(pg.venda_id)) continue
          zPorForma[nome] = (zPorForma[nome] ?? 0) + (pg.valor ?? 0)
          zPorTipo[tipo] = (zPorTipo[tipo] ?? 0) + (pg.valor ?? 0)
        }
      }

      zReport = {
        aberto_em: ultimoCaixa.aberto_em,
        fechado_em: ultimoCaixa.fechado_em ?? new Date().toISOString(),
        valor_abertura: ultimoCaixa.valor_abertura,
        obs_fechamento: ultimoCaixa.obs_fechamento ?? null,
        totalVendas: zVendas.reduce((s, v) => s + (v.total ?? 0), 0) - zFiadoCancValor,
        qtdVendas: zVendas.length,
        totalReforcos: zMov.filter((m) => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0),
        totalRetiradas: zMov.filter((m) => m.tipo === 'retirada').reduce((s, m) => s + m.valor, 0),
        totalCrediario: zPorTipo['fiado'] ?? 0,
        porForma: zPorForma,
        porTipo: zPorTipo,
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
      reforcosDinheiro={reforcosDinheiro}
      retiradasDinheiro={retiradasDinheiro}
      recebidosDinheiro={recebidosDinheiro}
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
      formas={formas.length > 0 ? formas : ['Dinheiro', 'PIX', 'Cartão de Débito', 'Cartão de Crédito']}
      porForma={porForma}
      porTipo={porTipo}
      vendasPorTipo={vendasPorTipo}
      vendasDetalhe={vendasDetalhe}
      erro={erro}
      fechado={fechado === '1'}
      aberto={aberto === '1'}
      zReport={zReport}
    />
  )
}
