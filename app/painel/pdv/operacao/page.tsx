import { createServiceClient, requireAuth, fetchAll } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { hojeSP } from '@/lib/utils'
import { pixSemComprovante } from '@/lib/pix-pendentes'
import { agruparPorDestino, casarFornecedor, ehContaPropria, normNome, separarComprovantes, type ChavePixRef, type DestinoNaTela, type FornecedorRef, type PixAvisos } from '@/lib/pix-destinos'
import { carregarDevolucoesCaixa, aplicarEstornosPix } from '@/lib/devolucoes-caixa'
import { OperacaoClient } from './OperacaoClient'

// PIX do dia agrupado por QUEM RECEBEU — a conferência que o dono faz no Telegram,
// só que já somada e ligada ao cadastro. O app não fala com o Telegram: o bot grava
// cada comprovante em `comprovantes_pix` e aqui a gente só lê e agrupa.
// Grupo do Telegram por loja: o bot identifica a loja pelo nome de quem abriu o
// caixa no grupo (`pix_periodos.aberto_por`). Sem migration, sem cadastro novo —
// e se um dia a loja trocar de grupo, a tela acompanha sozinha.
async function grupoDoTelegram(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  nomeLoja: string,
): Promise<number | null> {
  const alvo = normNome(nomeLoja)
  if (!alvo) return null
  const { data } = await supabase
    .from('pix_periodos')
    .select('telegram_chat_id, aberto_por, aberto_em')
    .order('aberto_em', { ascending: false })
    .limit(120)
  const conta = new Map<number, number>()
  for (const p of data ?? []) {
    const quem = normNome(p.aberto_por)
    if (!quem) continue
    if (alvo.length >= 6 && (quem.includes(alvo) || alvo.includes(quem.replace('TECNOCELL ', '')))) {
      conta.set(p.telegram_chat_id as number, (conta.get(p.telegram_chat_id as number) ?? 0) + 1)
    }
  }
  let melhor: number | null = null
  let vistos = 0
  for (const [chat, n] of conta) if (n > vistos) { vistos = n; melhor = chat }
  return melhor
}


export default async function OperacaoPDVPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; fechado?: string; aberto?: string; esperado?: string; contado?: string; loja?: string }>
}) {
  const { erro, fechado, aberto, esperado, contado, loja } = await searchParams
  const supabase = await createServiceClient()

  // Loja atual (caixa é por loja): a loja ATIVA do usuário rege; atendente
  // restrita não consegue trocar pra loja que não opera (URL ignorada).
  const { data: lojasData } = await supabase.from('lojas').select('id, nome, cnpj').eq('ativa', true).order('nome')
  const lojas = lojasData ?? []
  const { ativa, operaveis } = await lojasDoUsuario().catch(() => ({ ativa: null, operaveis: lojas }))
  const lojaAtual = (loja && operaveis.some((l) => l.id === loja)) ? loja : (ativa?.id ?? lojas[0]?.id ?? '')

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



  let estornosPix = 0
  let estornosSemSplit = 0
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
  let vendasDia: { id: string; total: number; created_at: string; forma_pagamento_id: string | null; forma_pagamento: string; recebido?: number; formas?: string[] }[] = []
  let porForma: Record<string, number> = {}
  let porTipo: Record<string, number> = {}
  // Taxa cobrada A MAIS do cliente no cartão (repassada, não absorvida pela
  // loja — confirmado com o dono). porTipo/porForma mostram o valor LÍQUIDO
  // do produto (pra bater com Total Vendido), então informa a taxa à parte
  // pra conferir com a maquininha: Cartão (líquido) + Taxa = fatura da maquininha.
  let totalTaxaCartao = 0
  // vendas de cada tipo, pra conferência (bater comprovante de PIX com a venda)
  const vendasPorTipo: Record<string, { id: string; numero: number | null; hora: string; cliente: string | null; valorForma: number; totalVenda: number; taxa?: number; fiado?: boolean; fiadoAbatido?: number }[]> = {}
  let vendasDetalhe: { id: string; numero: number | null; hora: string; cliente: string | null; total: number; devolvida: boolean; fiadoAbatido: number; fiadoValor: number; pagamentos: { nome: string; tipo: string; valor: number }[] }[] = []
  let pixPendentes: { id: string; cliente: string | null; valor: number; hora: string }[] = []

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
    const devolucoesCaixa = await carregarDevolucoesCaixa(supabase, caixaAberto, lojaAtual, vendasRaw.map(v => v.id))
    estornosPix = devolucoesCaixa.estornosPix
    estornosSemSplit = devolucoesCaixa.legadosSemSplit
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
      const [pagsRes, pessoasRes, fiadoCancRes, fiadoPagoRes] = await Promise.all([
        supabase
          .from('pagamentos_venda')
          .select('venda_id, forma_pagamento_id, valor, taxa')
          .in('venda_id', vendasRaw.map((v) => v.id)),
        supabase
          .from('pessoas')
          .select('id, nome')
          .in('id', [...new Set(vendasRaw.map((v) => v.pessoa_id).filter(Boolean))] as string[]),
        // Fiado DEVOLVIDO/cancelado não é mais dívida → não pode somar no caixa. O
        // lançamento é a verdade (a devolução cancela ele), mas o pagamentos_venda fica
        // — por isso o fiado cancelado "voltava" como fantasma no total (29/07).
        supabase
          .from('lancamentos')
          .select('venda_id, valor')
          .eq('status', 'cancelado')
          .ilike('descricao', '%Fiado%')
          .in('venda_id', vendasRaw.map((v) => v.id)),
        // Fiado ABATIDO (pago total ou parcial depois da venda, no F9/Fiados) — a
        // tag "Crédito Loja (Fiado)" aqui embaixo é a forma ORIGINAL da venda e
        // nunca muda, então quem confere via essa venda como "ainda é dívida"
        // mesmo já paga. O pagamento é outro evento, registrado só na conferência
        // de Dinheiro/PIX (achado no check-up de 27/08: a mesma venda aparecia
        // "Fiado" aqui e "Fiado recebido" lá embaixo, sem ligação visual entre as duas).
        supabase
          .from('lancamentos')
          .select('venda_id, valor_pago')
          .eq('tipo', 'receber')
          .neq('status', 'cancelado')
          .gt('valor_pago', 0)
          .in('venda_id', vendasRaw.map((v) => v.id)),
      ])
      const fiadoCancelado = new Set((fiadoCancRes.data ?? []).map((l) => l.venda_id as string))
      // total = venda.total (não lancamentos.valor — esse cai quando uma devolução
      // abate a dívida, então não serve de "total original" pra mostrar aqui).
      const fiadoAbatido: Record<string, number> = {}
      for (const l of (fiadoPagoRes.data ?? []) as { venda_id: string | null; valor_pago: number | null }[]) {
        if (!l.venda_id) continue
        fiadoAbatido[l.venda_id] = (fiadoAbatido[l.venda_id] ?? 0) + Number(l.valor_pago ?? 0)
      }
      // ...e o fiado cancelado também sai do TOTAL de vendas / total do turno — não só do
      // "por forma". Senão o R$ do fiado devolvido ficava fantasma no total (29/07).
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
        // Fiado cancelado por devolução: a etiqueta da forma é escondida logo
        // acima (não é dinheiro) e o valor já saiu do total do turno. Sem
        // marcar aqui, a linha ficava só com um "—" mudo e o valor cheio do
        // lado — parecia venda sem forma de pagamento, e as contas da tela
        // não fechavam com o total do cabeçalho.
        devolvida: fiadoCancelado.has(v.id) || devolucoesCaixa.integrais.has(v.id),
        // quanto do fiado já foi pago depois da venda (F9/Fiados) — 0 = ainda em aberto
        fiadoAbatido: fiadoAbatido[v.id] ?? 0,
        // fatia da venda que foi fiado (não o total) — numa venda MISTA (parte
        // dinheiro + parte fiado), comparar o abatido com o total inteiro dava
        // conta errada.
        fiadoValor: (pagsDaVenda[v.id] ?? []).filter((p) => p.tipo === 'fiado').reduce((s, p) => s + p.valor, 0),
        pagamentos: pagsDaVenda[v.id] ?? [],
      }))

      // Quanto CADA venda trouxe de dinheiro até agora — alimenta a coluna
      // Saldo de "Vendas do Dia". Antes o saldo olhava vendas.forma_pagamento_id
      // (uma forma só) e pulava a venda inteira se fosse fiado: venda mista
      // entrava CHEIA (com a parte fiada dentro) e fiado já pago não entrava
      // nunca. Agora: só o que entrou de verdade + o fiado abatido depois.
      const recebidoPorVenda: Record<string, number> = {}
      for (const v of vendasRaw) {
        const pagos = (pagsDaVenda[v.id] ?? [])
          .filter((p) => p.tipo !== 'fiado' && p.tipo !== 'vale_credito')
          .reduce((s, p) => s + p.valor, 0)
        recebidoPorVenda[v.id] = pagos + (fiadoAbatido[v.id] ?? 0)
      }
      vendasDia = vendasDia.map((v) => ({
        ...v,
        recebido: recebidoPorVenda[v.id] ?? 0,
        // Venda MISTA grava forma_pagamento_id NULL (não cabe uma forma só), e
        // a coluna caía no rótulo genérico "Outras" — escondendo justamente as
        // vendas mais confusas de conferir. Agora lista as formas de verdade
        // ("Crédito PagBank + Dinheiro"), que é o que a atendente precisa ver.
        formas: (pagsDaVenda[v.id] ?? []).map((p) => p.nome),
      }))

      for (const pg of pagsRes.data ?? []) {
        const nome = formasPorId[pg.forma_pagamento_id ?? ''] ?? 'Outras'
        const tipo = tipoPorId[pg.forma_pagamento_id ?? ''] ?? 'outros'
        if (tipo === 'fiado' && fiadoCancelado.has(pg.venda_id)) continue   // fiado devolvido não conta no caixa
        const valor = pg.valor ?? 0
        // Fiado já pago (F9/Fiados) sai do TOTAL da forma — essa linha é
        // "quanto ainda se deve", não "quanto foi vendido no fiado" (pedido
        // do dono 27/08: via R$760 gerado no dia com só R$684 em aberto de
        // verdade). Só no total: o valor de CADA venda continua cheio lá
        // embaixo (na "bata uma a uma"), que é o valor real daquele fiado —
        // subtrair ali quebraria o selo "misto" (compara valorForma x total).
        const paraTotal = tipo === 'fiado' ? Math.max(0, valor - (fiadoAbatido[pg.venda_id] ?? 0)) : valor
        porForma[nome] = (porForma[nome] ?? 0) + paraTotal
        porTipo[tipo] = (porTipo[tipo] ?? 0) + paraTotal
        if (tipo === 'cartao_credito' || tipo === 'cartao_debito') totalTaxaCartao += (pg as { taxa: number | null }).taxa ?? 0

        // Lista de CONFERÊNCIA: a Maria Eduarda Kappler da Silva bate comprovante por comprovante. Pra isso ela
        // precisa da VENDA (nº, hora, cliente) e de quanto DAQUELA forma entrou nela —
        // numa venda mista só o pedaço do PIX bate com o comprovante do PIX.
        const v = vendaPorId[pg.venda_id]
        if (!v) continue
        // Fiado ja QUITADO sai da lista de conferencia — nao sobrou nada pra
        // bater contra papel nenhum. Fica so na "Vendas deste caixa" (com o
        // selo "abatido"), que e o historico do dia. Pedido do dono 27/08:
        // "pq os abatidos ainda tao ali??" olhando essa mesma lista.
        if (tipo === 'fiado' && valor - (fiadoAbatido[pg.venda_id] ?? 0) <= 0.005) continue
        if (!vendasPorTipo[tipo]) vendasPorTipo[tipo] = []
        vendasPorTipo[tipo].push({
          id: v.id,
          numero: v.numero ?? null,
          hora: v.created_at,
          cliente: v.pessoa_id ? (nomePessoa[v.pessoa_id] ?? null) : null,
          valorForma: valor,
          totalVenda: v.total ?? 0,
          taxa: (pg as { taxa: number | null }).taxa ?? 0,
          fiadoAbatido: tipo === 'fiado' ? (fiadoAbatido[v.id] ?? 0) : undefined,
        })
      }
      for (const t of Object.keys(vendasPorTipo)) {
        vendasPorTipo[t].sort((a, b) => a.hora.localeCompare(b.hora))
      }
      // Total Vendido sai LÍQUIDO: a taxa da maquininha é cobrada a mais só pra
      // repassar o custo do cartão — não é receita da loja, nunca chega na
      // conta. Sem tirar, o total nunca fechava com a soma das formas (que já
      // são líquidas) e a diferença aparecia do nada. Decisão do dono em 27/08:
      // "tira a taxa da soma final toda, é só pra ajudar as meninas a pagar
      // pelo cartão".
      totalVendas -= totalTaxaCartao
    }
    // Fiado DESTE caixa (antes vinha de lancamentos por created_at — pegava fiado
    // de qualquer loja e até lançamento manual sem venda)
    const liquido = aplicarEstornosPix(totalVendas, porForma, porTipo, estornosPix)
    totalVendas = liquido.totalVendas
    porForma = liquido.porForma
    porTipo = liquido.porTipo
    totalCrediario = porTipo['fiado'] ?? 0

    // PIX sem comprovante: bate os PIX do caixa contra os comprovantes que caíram
    // no período (WhatsApp/Telegram). Só AVISA — não trava o fechamento.
    const pixDoCaixa = vendasPorTipo['pix'] ?? []
    // fiado recebido em PIX também entra na conferência (ex: 1 Pix de R$65 =
    // R$45 de venda + R$20 de fiado recebido — não pode acusar "sem comprovante")
    const pixFiado = (movResult.data ?? []).filter((m: any) => m.tipo === 'recebimento' && tipoDoTexto(m.forma_pagamento) === 'pix')
      .map((m: any) => ({ id: m.id, cliente: null, valor: Number(m.valor) || 0, hora: m.created_at }))
    if (pixDoCaixa.length > 0 || pixFiado.length > 0) {
      const compsRes = await supabase
        .from('comprovantes_pix')
        .select('valor')
        .neq('status', 'furo')
        .not('valor', 'is', null)
        .gte('recebido_em', caixaAberto.aberto_em)
      const comps = (compsRes.data ?? []) as { valor: number | null }[]
      pixPendentes = pixSemComprovante(
        pixDoCaixa.map((p) => ({ id: p.id, cliente: p.cliente, valor: p.valorForma, hora: p.hora, devolvidaIntegral: devolucoesCaixa.integrais.has(p.id) })),
        pixFiado,
        comps.map((c) => ({ valor: Number(c.valor) || 0 })),
      )
    }

    movimentos = movResult.data ?? []
    totalReforcos = movimentos.filter((m) => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0)
    totalRetiradas = movimentos.filter((m) => m.tipo === 'retirada').reduce((s, m) => s + m.valor, 0)
    // Reforço/sangria só mexem na GAVETA quando são em dinheiro (dá pra sangrar PIX, e
    // isso não tira cédula nenhuma)
    const ehDin = (m: { forma_pagamento: string }) => tipoDoTexto(m.forma_pagamento) === 'dinheiro'
    reforcosDinheiro = movimentos.filter((m) => m.tipo === 'reforco' && ehDin(m)).reduce((s, m) => s + m.valor, 0)
    retiradasDinheiro = movimentos.filter((m) => m.tipo === 'retirada' && ehDin(m)).reduce((s, m) => s + m.valor, 0)
    for (const m of movimentos.filter((m) => ['reforco', 'retirada'].includes(m.tipo) && !ehDin(m))) {
      const t = tipoDoTexto(m.forma_pagamento)
      const v = Number(m.valor) || 0
      const sinal = m.tipo === 'reforco' ? 1 : -1
      porTipo[t] = (porTipo[t] ?? 0) + sinal * v
      porForma[m.forma_pagamento] = (porForma[m.forma_pagamento] ?? 0) + sinal * v
    }
    // DEVOLUÇÃO em dinheiro — cédula que SAIU da gaveta pro cliente. O saldo já
    // subtrai totalDevolucoes; este era o gancho que faltava ligar (vinha 0).
    totalDevolucoes = movimentos.filter((m) => m.tipo === 'devolucao' && ehDin(m)).reduce((s, m) => s + m.valor, 0)

    // FIADO RECEBIDO — dinheiro que entrou sem ser venda. Antes não entrava em lugar
    // nenhum: a gaveta tinha R$50 a mais e o fechamento acusava SOBRA falsa.
    for (const m of movimentos.filter((x) => x.tipo === 'recebimento')) {
      const t = tipoDoTexto(m.forma_pagamento)
      const v = Number(m.valor) || 0
      if (t === 'dinheiro') {
        // separado porque o card da gaveta mostra numa linha própria
        // ("+ Fiado recebido em dinheiro"); somar em porTipo['dinheiro']
        // duplicaria o saldo, que já soma recebidosDinheiro à parte.
        recebidosDinheiro += v
      } else {
        porTipo[t] = (porTipo[t] ?? 0) + v   // PIX/cartão: aparece na linha do tipo, pra conferir
      }
      // "Recebimentos por Forma" conta TODO recebimento do dia, dinheiro
      // incluído — é recebimento, não venda (pedido do dono 27/08: "contar
      // fiado abatido no dia aqui tmb"). Antes só PIX/cartão entravam aqui e
      // o Dinheiro ficava de fora, sem motivo. porForma é só exibição, não
      // alimenta o saldo da gaveta.
      porForma[m.forma_pagamento] = (porForma[m.forma_pagamento] ?? 0) + v
      // na lista de conferência ele aparece como linha do tipo, marcado como fiado
      if (!vendasPorTipo[t]) vendasPorTipo[t] = []
      vendasPorTipo[t].push({
        id: m.id, numero: null, hora: m.created_at,
        cliente: (m.motivo ?? '').replace(/^Fiado recebido — /, '') || 'Fiado',
        valorForma: v, totalVenda: v, fiado: true,
      })
    }
  }

  // ─── PIX do dia por destino (conferência do dono, feita no Telegram) ───────
  // Lê os comprovantes que o bot já gravou desde que este caixa abriu e mostra:
  // quem recebeu, quanto, e quanto ainda se deve àquele fornecedor. Não baixa
  // nada sozinho — a baixa é um clique (ver baixarPixDoFornecedor em actions.ts).
  let pixDestinos: DestinoNaTela[] = []
  let pixAvisos: PixAvisos = { repetidos: 0, valorRepetido: 0, naoComprovante: 0, naoLidos: 0, semDestino: 0, valorSemDestino: 0, cruzados: 0, valorCruzado: 0, apagados: 0, daSessaoAnterior: 0 }
  // Troco fixo da loja (saldo inicial da conta Caixa) — base do aviso de abertura
  // diferente do troco quando o turno troca no meio do dia.
  let trocoPadrao = 0
  let pixFornecedorSemBaixa = { total: 0, comprovantes: 0 }
  if (caixaAberto) {
    const nomeLojaAtual = lojas.find((l) => l.id === lojaAtual)?.nome ?? ''
    const chat = await grupoDoTelegram(supabase, nomeLojaAtual)
    const [compsRes, fornecedores, chavesPix, abertos, contasProprias] = await Promise.all([
      chat
        ? supabase
            .from('comprovantes_pix')
            .select('valor, destinatario, extraido_raw, transacao_id, status, pagador, data_pix')
            .eq('telegram_chat_id', chat)
            .neq('status', 'furo')
            .gte('recebido_em', caixaAberto.aberto_em)
            .order('recebido_em')
        : Promise.resolve({ data: [] as { valor: number | null; destinatario: string | null; extraido_raw: unknown; transacao_id: string | null; status: string | null; pagador: string | null; data_pix: string | null }[] }),
      // `ambos` também é fornecedor: 43 dos cadastros estão marcados assim (H2O e ADL
      // entre eles) e filtrar só por 'fornecedor' escondia a dívida deles — o
      // comprovante caía em "não identificado" e a baixa não acontecia.
      // Cadastro INATIVO fica fora: casar o comprovante com um cadastro desligado
      // abriria baixa numa ficha que ninguém mais usa.
      fetchAll<FornecedorRef>((from, to) =>
        supabase.from('pessoas').select('id, nome, nome_fantasia, cpf_cnpj, chave_pix, ativo')
          .in('tipo', ['fornecedor', 'ambos']).order('nome').range(from, to)),
      fetchAll<ChavePixRef>((from, to) =>
        supabase.from('pessoa_chaves_pix').select('pessoa_id, chave, favorecido').eq('ativo', true).range(from, to)),
      fetchAll<{ pessoa_id: string | null; valor: number | null; valor_pago: number | null }>((from, to) =>
        supabase.from('lancamentos').select('pessoa_id, valor, valor_pago').eq('tipo', 'pagar').neq('status', 'cancelado').not('pessoa_id', 'is', null).range(from, to)),
      supabase.from('contas').select('chave_pix, titular').not('chave_pix', 'is', null),
    ])
    const emAberto: Record<string, number> = {}
    for (const l of abertos) {
      if (!l.pessoa_id) continue
      const falta = Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)
      if (falta > 0.005) emAberto[l.pessoa_id] = (emAberto[l.pessoa_id] ?? 0) + falta
    }
    // cadastro desligado não casa comprovante (só some quem está explicitamente inativo;
    // `ativo` nulo continua valendo, porque é como a base antiga ficou)
    const fornecedoresAtivos = fornecedores.filter((f) => f.ativo !== false)
    const docsProprios = [...lojas.map((l) => l.cnpj), ...((contasProprias.data ?? []).map((c) => c.chave_pix))]
    const nomesProprios = (contasProprias.data ?? []).map((c) => c.titular)

    // MESMO Pix postado no grupo da outra loja: o bot avisa nas duas, mas quem
    // decide é gente. Enquanto ninguém decidir, não soma em loja nenhuma —
    // contar nos dois lados é baixar dívida de fornecedor duas vezes.
    const meus = (compsRes.data ?? []) as { valor: number | null; destinatario: string | null; extraido_raw: unknown; transacao_id: string | null; status: string | null; pagador: string | null; data_pix: string | null }[]
    const txMinhas = [...new Set(meus.map((c) => c.transacao_id).filter(Boolean))] as string[]
    let txDoOutroGrupo: string[] = []
    if (chat && txMinhas.length > 0) {
      const { data: outras } = await supabase
        .from('comprovantes_pix')
        .select('transacao_id')
        .neq('telegram_chat_id', chat)
        .in('transacao_id', txMinhas)
      txDoOutroGrupo = [...new Set((outras ?? []).map((o) => o.transacao_id as string))]
    }

    const sep = separarComprovantes(
      meus.map((c) => ({
        valor: Number(c.valor) || null,
        destinatario: c.destinatario ?? null,
        doc: (c.extraido_raw as { destinatario_doc?: string } | null)?.destinatario_doc ?? null,
        transacaoId: c.transacao_id ?? null,
        status: c.status ?? null,
        pagador: c.pagador ?? null,
        dia: c.data_pix ?? null,
      })),
      { transacoesDoOutroGrupo: txDoOutroGrupo },
    )
    pixAvisos = {
      repetidos: sep.repetidos,
      valorRepetido: sep.valorRepetido,
      naoComprovante: sep.naoComprovante,
      naoLidos: sep.naoLidos,
      semDestino: sep.semDestino,
      valorSemDestino: sep.valorSemDestino,
      cruzados: sep.cruzados.length,
      valorCruzado: sep.valorCruzado,
      apagados: sep.apagados,
      daSessaoAnterior: 0,
    }

    // CAIXA FECHADO NO MEIO DO DIA: o bloco lê os comprovantes DESTA sessão (desde
    // que este caixa abriu). Se o caixa anterior de hoje tinha comprovante de
    // fornecedor e a baixa não foi feita antes de fechar, a dívida continua aberta
    // e não aparece mais aqui. Em vez de somar de novo (arriscaria baixa em dobro),
    // a tela só avisa quantos ficaram para trás.
    if (chat) {
      const { count } = await supabase
        .from('comprovantes_pix')
        .select('id', { count: 'exact', head: true })
        .eq('telegram_chat_id', chat)
        .neq('status', 'furo')
        .eq('data_pix', hojeSP())
        .lt('recebido_em', caixaAberto.aberto_em)
      pixAvisos.daSessaoAnterior = count ?? 0
    }
    pixDestinos = agruparPorDestino(sep.validos).map((d) => {
      const f = casarFornecedor(d, fornecedoresAtivos, chavesPix)
      return {
        ...d,
        fornecedorId: f?.id ?? null,
        fornecedorNome: f?.nome ?? null,
        propria: ehContaPropria(d, docsProprios, nomesProprios),
        divida: f ? Math.round((emAberto[f.id] ?? 0) * 100) / 100 : 0,
      }
    })

    // Pix do dia que foram para fornecedor: é o que precisa de baixa antes de
    // fechar a sessão (senão a dívida fica em aberto e o comprovante não volta).
    const paraFornecedor = pixDestinos.filter((d) => !d.propria && d.fornecedorId && d.total > 0.005)
    pixFornecedorSemBaixa = {
      total: Math.round(paraFornecedor.reduce((s, d) => s + d.total, 0) * 100) / 100,
      comprovantes: paraFornecedor.reduce((s, d) => s + d.comprovantes, 0),
    }

    const { data: contaCaixa } = await supabase
      .from('contas')
      .select('saldo_inicial')
      .eq('tipo', 'caixa')
      .eq('loja_id', lojaAtual)
      .limit(1)
      .maybeSingle()
    trocoPadrao = Number(contaCaixa?.saldo_inicial ?? 0)
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
    totalTaxaCartao: number
    estornosPix: number
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
        // nullsFirst: false — caixa 'fechado' sem data de fechamento (fantasma) vinha
        // PRIMEIRO no DESC e virava o "último caixa", zerando o troco do papel Z.
        .order('fechado_em', { ascending: false, nullsFirst: false })
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
      const zDevolucoes = await carregarDevolucoesCaixa(supabase, ultimoCaixa, lojaAtual, zVendas.map(v => v.id))
      const zMov = zMovResult.data ?? []
      // Mesma verdade do caixa aberto: pagamentos_venda classificado por tipo
      const zPorForma: Record<string, number> = {}
      const zPorTipo: Record<string, number> = {}
      let zFiadoCancValor = 0   // fiado cancelado/devolvido — sai do por-forma E do total
      let zTotalTaxaCartao = 0
      if (zVendas.length > 0) {
        const [zPagsRes, zFiadoCancRes, zFiadoPagoRes] = await Promise.all([
          supabase
            .from('pagamentos_venda')
            .select('venda_id, forma_pagamento_id, valor, taxa')
            .in('venda_id', zVendas.map((v) => v.id)),
          // mesmo motivo do caixa aberto: fiado cancelado/devolvido não conta
          supabase
            .from('lancamentos')
            .select('venda_id, valor')
            .eq('status', 'cancelado')
            .ilike('descricao', '%Fiado%')
            .in('venda_id', zVendas.map((v) => v.id)),
          // fiado já pago (F9/Fiados) — mesma correção do caixa aberto (27/08):
          // sem isso o Z mostrava o valor CHEIO vendido, não o que ainda falta.
          supabase
            .from('lancamentos')
            .select('venda_id, valor_pago')
            .eq('tipo', 'receber')
            .neq('status', 'cancelado')
            .gt('valor_pago', 0)
            .in('venda_id', zVendas.map((v) => v.id)),
        ])
        const zFiadoCancelado = new Set((zFiadoCancRes.data ?? []).map((l) => l.venda_id as string))
        zFiadoCancValor = (zFiadoCancRes.data ?? []).reduce((s, l) => s + Number((l as { valor: number | null }).valor ?? 0), 0)
        const zFiadoAbatido: Record<string, number> = {}
        for (const l of (zFiadoPagoRes.data ?? []) as { venda_id: string | null; valor_pago: number | null }[]) {
          if (!l.venda_id) continue
          zFiadoAbatido[l.venda_id] = (zFiadoAbatido[l.venda_id] ?? 0) + Number(l.valor_pago ?? 0)
        }
        for (const pg of zPagsRes.data ?? []) {
          const nome = formasPorId[pg.forma_pagamento_id ?? ''] ?? 'Outras'
          const tipo = tipoPorId[pg.forma_pagamento_id ?? ''] ?? 'outros'
          if (tipo === 'fiado' && zFiadoCancelado.has(pg.venda_id)) continue
          const valor = pg.valor ?? 0
          const paraTotal = tipo === 'fiado' ? Math.max(0, valor - (zFiadoAbatido[pg.venda_id] ?? 0)) : valor
          zPorForma[nome] = (zPorForma[nome] ?? 0) + paraTotal
          zPorTipo[tipo] = (zPorTipo[tipo] ?? 0) + paraTotal
          if (tipo === 'cartao_credito' || tipo === 'cartao_debito') zTotalTaxaCartao += (pg as { taxa: number | null }).taxa ?? 0
        }
      }
      // Fiado antigo pago durante o turno também entra no por-forma — igual ao
      // caixa aberto. Faltava aqui: o Z fechava sem esse dinheiro em forma
      // nenhuma, mesmo ele estando na gaveta/conta.
      for (const m of zMov.filter((x) => x.tipo === 'recebimento')) {
        zPorForma[m.forma_pagamento] = (zPorForma[m.forma_pagamento] ?? 0) + (Number(m.valor) || 0)
      }
      for (const m of zMov.filter((m) => ['reforco', 'retirada'].includes(m.tipo) && tipoDoTexto(m.forma_pagamento) !== 'dinheiro')) {
        const t = tipoDoTexto(m.forma_pagamento)
        const v = Number(m.valor) || 0
        const sinal = m.tipo === 'reforco' ? 1 : -1
        zPorTipo[t] = (zPorTipo[t] ?? 0) + sinal * v
        zPorForma[m.forma_pagamento] = (zPorForma[m.forma_pagamento] ?? 0) + sinal * v
      }

      const zLiquido = aplicarEstornosPix(0, zPorForma, zPorTipo, zDevolucoes.estornosPix)
      Object.assign(zPorForma, zLiquido.porForma)
      Object.assign(zPorTipo, zLiquido.porTipo)
      zReport = {
        aberto_em: ultimoCaixa.aberto_em,
        fechado_em: ultimoCaixa.fechado_em ?? new Date().toISOString(),
        valor_abertura: ultimoCaixa.valor_abertura,
        obs_fechamento: ultimoCaixa.obs_fechamento ?? null,
        // líquido, igual ao caixa aberto: a taxa é repasse do custo do cartão,
        // não receita — tirar aqui faz o total fechar com a soma das formas.
        totalVendas: zVendas.reduce((s, v) => s + (v.total ?? 0), 0) - zFiadoCancValor - zTotalTaxaCartao - zDevolucoes.estornosPix,
        qtdVendas: zVendas.length,
        totalReforcos: zMov.filter((m) => m.tipo === 'reforco').reduce((s, m) => s + m.valor, 0),
        totalRetiradas: zMov.filter((m) => m.tipo === 'retirada').reduce((s, m) => s + m.valor, 0),
        totalCrediario: zPorTipo['fiado'] ?? 0,
        porForma: zPorForma,
        porTipo: zPorTipo,
        totalTaxaCartao: zTotalTaxaCartao,
        estornosPix: zDevolucoes.estornosPix,
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
      totalTaxaCartao={totalTaxaCartao}
      vendasPorTipo={vendasPorTipo}
      vendasDetalhe={vendasDetalhe}
      pixPendentes={pixPendentes}
      pixDestinos={pixDestinos}
      pixAvisos={pixAvisos}
      pixFornecedorSemBaixa={pixFornecedorSemBaixa}
      trocoPadrao={trocoPadrao}
      estornosPix={estornosPix}
      estornosSemSplit={estornosSemSplit}
      erro={erro}
      fechado={fechado === '1'}
      aberto={aberto === '1'}
      zReport={zReport}
    />
  )
}
