import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { FecharMesButton } from './FecharMesButton'
import { BotaoImprimirResumo } from './BotaoImprimirResumo'
import { estoqueCustoPorLoja } from '@/lib/estoque-custo'
import { ehCompraDeMercadoria } from '@/lib/financeiro-setores'

function nomeMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${nomes[m - 1]}/${ano}`
}

const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

const CAT_ESTOQUE: [string, string][] = [
  ['frontal', 'Frontal'], ['bateria', 'Bateria'], ['acessorios', 'Acessórios (consignado)'],
  ['parte_traseira', 'Parte Traseira'], ['ferramentas', 'Ferramentas'], ['peliculas', 'Películas'],
  ['celular', 'Celular'], ['outros', 'Outros (componentes/touch/LCD/capa)'],
]
const CAIXA_DET: [string, string][] = [
  ['caderno', 'Dinheiro caderno'], ['pagbank', 'Pagbank'], ['caixa_dia', 'Caixa do dia'], ['envelopes', 'Envelopes'],
]

type Abertura = {
  caixa?: Record<string, number>
  caixa_detalhado?: Record<string, Record<string, number>>
  estoque?: Record<string, number>
  estoque_categorias?: Record<string, Record<string, number>>
  consignado?: Record<string, number>
  perdas?: Record<string, number>
  trocas?: { pendentes?: Record<string, number>; indo?: Record<string, number> }
}

export default async function FechamentoMesPage({ searchParams }: { searchParams: Promise<{ mes?: string; loja?: string }> }) {
  const params = await searchParams
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const pedido = params.mes ?? hoje.slice(0, 7)
  const mes = /^\d{4}-\d{2}$/.test(pedido) ? pedido : hoje.slice(0, 7)
  const lojaPedida = params.loja ?? ''
  const [ano, m] = mes.split('-').map(Number)
  const inicio = mes + '-01'
  const proxMes = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  const mesAnterior = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`
  const mesSeguinte = proxMes.slice(0, 7)
  const [anoAnt, mAnt] = mesAnterior.split('-').map(Number)
  const mesAntAnt = mAnt === 1 ? `${anoAnt - 1}-12` : `${anoAnt}-${String(mAnt - 1).padStart(2, '0')}`

  const supabase = await createServiceClient()

  // ─── Avisos antes de fechar ─────────────────────────────────────────────────
  // "Fechar mês" congela o estoque do MOMENTO do clique. Se o mês está sendo
  // fechado com atraso e já houve venda depois dele, o custo dessa venda entra no
  // resultado do mês errado. E caixa aberto faz o caixa final sair sem o dia.
  // Estas duas leituras dependem só do `mes` (calculado acima), então entram no
  // MESMO lote das outras — antes era uma segunda rodada de banco só de espera.
  const inicioSeguinte = `${mesSeguinte}-01T00:00:00-03:00`

  const [{ data: lojas }, deps, cxs, perfis, aberturaRow, fechadoRow, anteriorRow, antAntRow, { count: vendasDepois }, { data: caixasAbertos }] = await Promise.all([
    supabase.from('lojas').select('id, nome').order('nome'),
    fetchAll<any>((from, to) => supabase.from('depositos').select('id, loja_id').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('caixas').select('id, loja_id').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('perfis').select('id, nome, lojas_permitidas').range(from, to)),
    supabase.from('configuracoes').select('valor').eq('chave', `abertura:${mes}`).maybeSingle(),
    supabase.from('configuracoes').select('valor').eq('chave', `fechamento_mes:${mes}`).maybeSingle(),
    supabase.from('configuracoes').select('valor').eq('chave', `fechamento_mes:${mesAnterior}`).maybeSingle(),
    supabase.from('configuracoes').select('valor').eq('chave', `fechamento_mes:${mesAntAnt}`).maybeSingle(),
    supabase.from('vendas').select('id', { count: 'exact', head: true }).gte('data', inicioSeguinte).eq('status', 'concluida'),
    supabase.from('caixas').select('id, loja_id').eq('status', 'aberto'),
  ])

  const lojasList = (lojas ?? []) as { id: string; nome: string }[]
  const abertoPorLoja = lojasList.filter((l) => (caixasAbertos ?? []).some((c) => c.loja_id === l.id)).map((l) => l.nome)
  const avisosFechamento: string[] = []
  if ((vendasDepois ?? 0) > 0) {
    avisosFechamento.push(
      `Já houve ${vendasDepois} venda${vendasDepois === 1 ? '' : 's'} depois de ${nomeMes(mes)}. ` +
      `Fechar agora congela o estoque de HOJE, então o custo dessas vendas cai no resultado de ${nomeMes(mes)} ` +
      `e ${nomeMes(mesSeguinte)} começa sem ele. Se o mês está atrasado, feche antes de vender.`,
    )
  }
  if (abertoPorLoja.length > 0) {
    avisosFechamento.push(
      `O caixa de ${abertoPorLoja.join(' e ')} está aberto. Feche o caixa antes de fechar o mês — ` +
      `senão o dinheiro do dia fica fora do caixa final.`,
    )
  }
  const petropolisId = lojasList.find((l) => l.nome === 'Petrópolis')?.id ?? null
  const lojaDeDeposito = new Map((deps ?? []).map((d) => [d.id, d.loja_id as string | null]))
  const lojaDeCaixa = new Map((cxs ?? []).map((c) => [c.id, c.loja_id as string | null]))
  const perfisPorNome = new Map<string, string[]>()
  for (const p of (perfis ?? [])) {
    if (!p.nome) continue
    perfisPorNome.set(norm(p.nome), (p.lojas_permitidas ?? []).filter(Boolean) as string[])
  }
  const lojaDePessoa = (nome: string): string | null => {
    const n = norm(nome)
    let ls = perfisPorNome.get(n)
    if (!ls) {
      const chave = n.split(' ').slice(0, 2).join(' ')
      for (const [pnome, l] of perfisPorNome) if (pnome.includes(chave)) { ls = l; break }
    }
    if (!ls || ls.length === 0) return null
    return ls.length === 1 ? ls[0] : null
  }

  const aberturaValor = aberturaRow?.data ? (aberturaRow.data.valor as Abertura) : null
  const fechamento = fechadoRow?.data ? (fechadoRow.data.valor as { fechado_em: string; estoque_final?: Record<string, { vitrine: number; fundo: number }> }) : null
  const fechamentoAnterior = anteriorRow?.data
    ? (anteriorRow.data.valor as { estoque_final?: Record<string, { vitrine: number; fundo: number }>; caixa_final?: Record<string, number> })
    : null
  const fechamentoAntAnt = antAntRow?.data
    ? (antAntRow.data.valor as { estoque_final?: Record<string, { vitrine: number; fundo: number }> })
    : null

  // Estoque a custo AGORA (vitrine/fundo por loja) — o "final" deste mês.
  // Inicial = congelado no fechamento do mês anterior (mesma régua de preco_custo).
  // Mês FECHADO: usa o estoque congelado no fechamento (não o atual) — senão
  // movimentação depois do fechamento mudava o "Final do mês"/"Consumido".
  const estoqueFinalPorLoja = fechamento?.estoque_final
    ?? (await estoqueCustoPorLoja(supabase).catch(() => ({} as Record<string, { vitrine: number; fundo: number }>)))
  const estoqueInicialPorLoja = fechamentoAnterior?.estoque_final ?? {}

  // Forma de pagamento → tipo (pra saber o que é DINHEIRO de verdade, não PIX/cartão)
  const { data: formasPg } = await supabase.from('formas_pagamento').select('id, tipo')
  const tipoPorFormaId = new Map((formasPg ?? []).map((f) => [f.id, f.tipo as string]))
  const ehDinheiro = (txt: string | null | undefined) => (txt ?? '').trim().toLowerCase().includes('dinheiro')

  // Mercadoria comprada é estoque, não despesa — a lista de categorias que valem
  // como compra mora em lib/financeiro-setores.ts (ehCompraDeMercadoria), junto com
  // as outras classificações do financeiro, pra não nascer uma terceira grafia solta.

  // Movimento de um mês (entradas, saídas, despesas e dinheiro) por loja.
  // Reusado pro mês atual E pro anterior — é o que sustenta a comparação mês a mês.
  const movimentoDoMes = async (de: string, ate: string) => {
    // timestamptz (vendas.data, movimentos_caixa.created_at) corta o mês em São Paulo:
    // sem o -03:00, venda às 22h30 do dia 30 cai no mês seguinte (UTC).
    const deTs = de + 'T00:00:00-03:00'
    const ateTs = ate + 'T00:00:00-03:00'
    const [pags, movsCaixa, comprasItens, despesas] = await Promise.all([
      fetchAll<any>((from, to) => supabase.from('pagamentos_venda')
        .select('valor, forma_pagamento_id, vendas!inner(deposito_id, numero, status, uso_interno, data)')
        .eq('status', 'pago').eq('vendas.status', 'concluida').eq('vendas.uso_interno', false)
        .lt('vendas.numero', 100000).gte('vendas.data', deTs).lt('vendas.data', ateTs).range(from, to)),
      // TODOS os movimentos do mês: recebimento (fiado), reforço (entra na gaveta),
      // retirada/sangria e devolução em dinheiro (saem da gaveta).
      fetchAll<any>((from, to) => supabase.from('movimentos_caixa')
        .select('tipo, forma_pagamento, valor, caixa_id')
        .gte('created_at', deTs).lt('created_at', ateTs).range(from, to)),
      fetchAll<any>((from, to) => supabase.from('itens_nota_entrada')
        .select('total_item, deposito_id, notas_entrada!inner(data_entrada, status)')
        .neq('notas_entrada.status', 'cancelada')
        .gte('notas_entrada.data_entrada', de).lt('notas_entrada.data_entrada', ate).range(from, to)),
      fetchAll<any>((from, to) => supabase.from('lancamentos')
        .select('valor, loja_id, categoria, pessoa_nome, forma_pagamento').eq('tipo', 'pagar').eq('status', 'pago')
        .gte('data_pagamento', deTs).lt('data_pagamento', ateTs).range(from, to)),
    ])

    const porLoja: Record<string, { loja: string; nome: string; entradas: number; fiadoCobrado: number; compras: number; despesas: number }> = {}
    for (const l of lojasList) porLoja[l.id] = { loja: l.id, nome: l.nome, entradas: 0, fiadoCobrado: 0, compras: 0, despesas: 0 }
    const add = (id: string | null, campo: 'entradas' | 'fiadoCobrado' | 'compras' | 'despesas', valor: number) => {
      if (!id || !porLoja[id]) return
      porLoja[id][campo] += valor
    }

    for (const p of pags) add(lojaDeDeposito.get(p.vendas?.deposito_id) ?? null, 'entradas', p.valor ?? 0)
    for (const r of movsCaixa) if (r.tipo === 'recebimento') add(lojaDeCaixa.get(r.caixa_id) ?? null, 'fiadoCobrado', r.valor ?? 0)
    for (const c of comprasItens) add(lojaDeDeposito.get(c.deposito_id) ?? null, 'compras', c.total_item ?? 0)
    for (const d of despesas) {
      if (ehCompraDeMercadoria(d.categoria)) continue
      const loja = d.loja_id || lojaDePessoa(d.pessoa_nome || '') || petropolisId
      add(loja, 'despesas', d.valor ?? 0)
    }

    // 💵 DINHEIRO (gaveta) por loja, no mês: cédula que entrou − cédula que saiu.
    // O resto do fluxo (PIX/cartão) é banco/maquininha — aqui é só o que dá pra contar na mão.
    const dinheiroPorLoja: Record<string, { entrou: number; saiu: number }> = {}
    for (const l of lojasList) dinheiroPorLoja[l.id] = { entrou: 0, saiu: 0 }
    const addDin = (id: string | null, campo: 'entrou' | 'saiu', valor: number) => {
      if (!id || !dinheiroPorLoja[id]) return
      dinheiroPorLoja[id][campo] += valor
    }
    // venda paga em dinheiro
    for (const p of pags) {
      if (tipoPorFormaId.get(p.forma_pagamento_id) === 'dinheiro')
        addDin(lojaDeDeposito.get(p.vendas?.deposito_id) ?? null, 'entrou', p.valor ?? 0)
    }
    // movimentos da gaveta: recebimento de fiado e reforço entram; retirada/devolução saem
    for (const m of movsCaixa) {
      if (!ehDinheiro(m.forma_pagamento)) continue
      const loja = lojaDeCaixa.get(m.caixa_id) ?? null
      if (m.tipo === 'recebimento' || m.tipo === 'reforco') addDin(loja, 'entrou', m.valor ?? 0)
      else if (m.tipo === 'retirada' || m.tipo === 'devolucao') addDin(loja, 'saiu', m.valor ?? 0)
    }
    // despesa paga em dinheiro
    for (const d of despesas) {
      if (!ehDinheiro(d.forma_pagamento)) continue
      if (ehCompraDeMercadoria(d.categoria)) continue   // mercadoria é estoque, não gaveta
      const loja = d.loja_id || lojaDePessoa(d.pessoa_nome || '') || petropolisId
      addDin(loja, 'saiu', d.valor ?? 0)
    }

    return { porLoja, dinheiroPorLoja }
  }

  const inicioAnterior = mesAnterior + '-01'
  const [movAtual, movAnterior] = await Promise.all([
    movimentoDoMes(inicio, proxMes),
    movimentoDoMes(inicioAnterior, inicio),
  ])
  const porLoja = movAtual.porLoja
  const dinheiroPorLoja = movAtual.dinheiroPorLoja

  const perdasApp = await fetchAll<any>((from, to) => supabase.from('movimentacoes_estoque')
    .select('quantidade, observacao, deposito_id, produtos(nome, preco_custo)')
    .eq('operacao', 'perda').gte('created_at', inicio + 'T00:00:00-03:00').lt('created_at', proxMes + 'T00:00:00-03:00').range(from, to))

  // Trocas SP ainda não resolvidas (status 'enviado'): dinheiro "na rua" com o
  // fornecedor. Sem corte por data — uma troca antiga continua pendente até voltar/abater.
  const trocasSp = await fetchAll<any>((from, to) => supabase.from('trocas_sp')
    .select('valor, loja_id').eq('status', 'enviado').range(from, to))

  const perdasPorLoja: Record<string, { total: number; itens: { nome: string; custo: number; motivo: string }[] }> = {}
  for (const pd of perdasApp) {
    const loja = lojaDeDeposito.get(pd.deposito_id)
    if (!loja) continue
    const custo = (pd.produtos?.preco_custo ?? 0) * (pd.quantidade ?? 0)
    ;(perdasPorLoja[loja] ??= { total: 0, itens: [] }).total += custo
    perdasPorLoja[loja].itens.push({ nome: pd.produtos?.nome ?? '—', custo, motivo: pd.observacao || '—' })
  }

  const trocasNaRua: Record<string, number> = {}
  for (const t of trocasSp) {
    if (!t.loja_id) continue
    trocasNaRua[t.loja_id] = (trocasNaRua[t.loja_id] ?? 0) + Number(t.valor ?? 0)
  }

  // ─── Resumo do fechamento (uma folha, para imprimir e arquivar) ─────────────
  // O que o dono precisa ver de uma vez: quanto entrou, quanto saiu, o resultado,
  // o dinheiro que sobrou na mão, o estoque congelado, o que voltou de devolução,
  // o que vai ser pago de comissão no mês seguinte e o que ficou devendo.
  const devolucoesMes = await fetchAll<{ valor_total: number | null }>((from, to) =>
    supabase.from('devolucoes').select('valor_total')
      .gte('created_at', inicio + 'T00:00:00-03:00').lt('created_at', proxMes + 'T00:00:00-03:00').range(from, to))
  const totalDevolucoes = devolucoesMes.reduce((s, d) => s + Number(d.valor_total ?? 0), 0)
  // As comissões do mês que fecha vencem no mês SEGUINTE inteiro. O limite tem que
  // ser o primeiro dia do mês depois do seguinte ('2026-11-32' não é data válida).
  const [anoSeg, mesSeg] = mesSeguinte.split('-').map(Number)
  const fimDoSeguinte = mesSeg === 12 ? `${anoSeg + 1}-01-01` : `${anoSeg}-${String(mesSeg + 1).padStart(2, '0')}-01`
  const comissaoProximoMes = await fetchAll<{ valor: number | null }>((from, to) =>
    supabase.from('lancamentos').select('valor').eq('tipo', 'pagar').eq('categoria', 'Comissão')
      .gte('data_vencimento', `${mesSeguinte}-01`).lt('data_vencimento', fimDoSeguinte).range(from, to))
  const totalComissaoProximo = comissaoProximoMes.reduce((s, l) => s + Number(l.valor ?? 0), 0)
  // CRÉDITO DE CLIENTE EM ABERTO — dinheiro que a loja deve em peça.
  //
  // É mercadoria que vai sair sem entrar dinheiro: a venda já foi contada, o caixa não
  // recebeu. Não é despesa (a despesa é lançada quando o crédito é usado), mas também não
  // é lucro livre: se você retirar esse valor, quando o cliente vier buscar a peça o
  // dinheiro não está mais lá. Por isso ele aparece no fechamento como reserva — o lucro
  // disponível para retirar é o resultado menos este saldo.
  // Reserva é sempre em REAIS, nunca em estoque: o cliente escolhe a peça, o crédito está
  // em reais, e o estoque precisa continuar batendo com a prateleira.
  const creditosAbertos = await fetchAll<{ loja_id: string | null; tipo: string; valor: number | null }>((from, to) =>
    supabase.from('creditos_clientes').select('loja_id, tipo, valor').range(from, to))
  const creditoAbertoPorLoja: Record<string, number> = {}
  for (const c of creditosAbertos) {
    if (!c.loja_id) continue
    const v = c.tipo === 'uso' || c.tipo === 'estorno' ? -Number(c.valor ?? 0) : Number(c.valor ?? 0)
    creditoAbertoPorLoja[c.loja_id] = (creditoAbertoPorLoja[c.loja_id] ?? 0) + v
  }
  const totalCreditoAberto = Object.values(creditoAbertoPorLoja).reduce((s, v) => s + v, 0)
  // venda BRUTA do mês por loja (a mesma régua da meta e da comissão)
  const vendasMes = await fetchAll<{ total: number | null; deposito_id: string }>((from, to) =>
    supabase.from('vendas').select('total, deposito_id')
      .gte('data', inicio).lt('data', proxMes).eq('status', 'concluida').range(from, to))
  const vendaBrutaPorLoja: Record<string, number> = {}
  for (const v of vendasMes) {
    const loja = lojaDeDeposito.get(v.deposito_id)
    if (!loja) continue
    vendaBrutaPorLoja[loja] = (vendaBrutaPorLoja[loja] ?? 0) + Number(v.total ?? 0)
  }
  const emAberto = await fetchAll<{ valor: number | null; valor_pago: number | null }>((from, to) =>
    supabase.from('lancamentos').select('valor, valor_pago').eq('tipo', 'pagar').neq('status', 'cancelado').range(from, to))
  const totalEmAberto = emAberto.reduce((s, l) => s + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0)
  // o fechamento gravado guarda caixa_final/estoque_final por loja (tipo não declara)
  const gravado = fechamento as { caixa_final?: Record<string, number>; estoque_final?: Record<string, { vitrine: number; fundo: number }>; fechado_em?: string; fechado_por?: string } | null

  const linhas = lojasList.map((l) => {
    const b = porLoja[l.id]
    const entradas = b.entradas + b.fiadoCobrado
    const saidas = b.compras + b.despesas
    // caixa final do mês anterior vira a abertura deste mês; sem mês fechado, cai na abertura manual (legado)
    const caixaInicial = fechamentoAnterior?.caixa_final?.[l.id] ?? aberturaValor?.caixa?.[l.id] ?? 0
    const caixaDet = aberturaValor?.caixa_detalhado?.[l.id] ?? {}
    const estoqueCategorias = aberturaValor?.estoque_categorias?.[l.id] ?? {}
    const consignado = aberturaValor?.consignado?.[l.id] ?? 0
    const perdas = aberturaValor?.perdas?.[l.id] ?? 0
    const perdasAppTotal = perdasPorLoja[l.id]?.total ?? 0
    const perdasItens = perdasPorLoja[l.id]?.itens ?? []
    const trocasPend = aberturaValor?.trocas?.pendentes?.[l.id] ?? 0
    const trocasIndo = aberturaValor?.trocas?.indo?.[l.id] ?? 0
    const trocasNaRuaValor = trocasNaRua[l.id] ?? 0
    const dinheiro = dinheiroPorLoja[l.id] ?? { entrou: 0, saiu: 0 }
    const dinheiroEmMaos = dinheiro.entrou - dinheiro.saiu
    const estoqueInicial = estoqueInicialPorLoja[l.id] ?? { vitrine: 0, fundo: 0 }
    const estoqueFinal = estoqueFinalPorLoja[l.id] ?? { vitrine: 0, fundo: 0 }
    const estoqueInicialTotal = estoqueInicial.vitrine + estoqueInicial.fundo
    const estoqueFinalTotal = estoqueFinal.vitrine + estoqueFinal.fundo
    // consumido só faz sentido quando há mês anterior fechado (senão "início=0" vira um
    // negativo gigante que parece erro). Primeiro mês não compara.
    const temEstoqueBase = !!fechamentoAnterior?.estoque_final?.[l.id]
    return {
      ...b, entradas, saidas, caixaInicial, caixaDet, estoqueCategorias, consignado, perdas, perdasApp: perdasAppTotal, perdasItens, trocasPend, trocasIndo, trocasNaRua: trocasNaRuaValor,
      dinheiroEntrou: dinheiro.entrou, dinheiroSaiu: dinheiro.saiu, dinheiroEmMaos,
      estoqueInicialVitrine: estoqueInicial.vitrine, estoqueInicialFundo: estoqueInicial.fundo, estoqueInicialTotal,
      estoqueFinalVitrine: estoqueFinal.vitrine, estoqueFinalFundo: estoqueFinal.fundo, estoqueFinalTotal,
      consumido: estoqueInicialTotal - estoqueFinalTotal,
      temEstoqueBase,
      // Referência de dinheiro em mãos: saldo do mês anterior + cédula que entrou −
      // cédula que saiu. É só REFERÊNCIA: depende de todo o dinheiro vivo estar
      // lançado (fornecedor pago em espécie, envelope no cofre, troco), e em outubro
      // ainda não está. Por isso o campo abre em BRANCO — quem fecha digita o que
      // contou. O cálculo antigo (caixaInicial + entradas − saidas) somava PIX,
      // cartão e compras e abria em −61.176,75: bastava clicar para fechar o mês
      // com um caixa negativo que virava a abertura de novembro.
      caixaCalculado: Math.max(0, Math.round((caixaInicial + dinheiroEmMaos) * 100) / 100),
      resultado: entradas - saidas,
      // Reserva: crédito que a loja deve em peça. Não sai do caixa, mas não é lucro livre.
      creditoAberto: Math.round((creditoAbertoPorLoja[l.id] ?? 0) * 100) / 100,
      resultadoDisponivel: Math.round((entradas - saidas - (creditoAbertoPorLoja[l.id] ?? 0)) * 100) / 100,
    }
  })

  const lojaSel = lojasList.some((l) => l.id === lojaPedida) ? lojaPedida : (lojasList[0]?.id ?? '')
  const linha = linhas.find((l) => l.loja === lojaSel)

  // Comparação com o mês anterior (mesma loja selecionada).
  const prev = movAnterior.porLoja[lojaSel] ?? { entradas: 0, fiadoCobrado: 0, compras: 0, despesas: 0 }
  const prevEntradas = prev.entradas + prev.fiadoCobrado
  const prevSaidas = prev.compras + prev.despesas
  const prevResultado = prevEntradas - prevSaidas
  const prevDespesa = prev.despesas
  // estoque consumido do mês anterior: precisa do congelado dele (fechamentoAnterior)
  // E do congelado do mês antes dele (fechamentoAntAnt). Sem os dois, fica "—".
  const prevEstInicial = fechamentoAntAnt?.estoque_final?.[lojaSel]
  const prevEstFinal = fechamentoAnterior?.estoque_final?.[lojaSel]
  const temPrevEstoque = !!(prevEstInicial && prevEstFinal)
  const prevConsumido = temPrevEstoque
    ? (prevEstInicial.vitrine + prevEstInicial.fundo) - (prevEstFinal.vitrine + prevEstFinal.fundo)
    : null

  // linhas prontas para a folha de resumo (usa o fechamento gravado)
  const resumo = linhas.map((l) => ({
    nome: lojasList.find((x) => x.id === l.loja)?.nome ?? '—',
    vendaBruta: vendaBrutaPorLoja[l.loja] ?? 0,
    entradas: l.entradas,
    saidas: l.saidas,
    caixaFinal: gravado?.caixa_final?.[l.loja] ?? null,
    estoqueFinal: gravado?.estoque_final?.[l.loja] ?? null,
    consumido: l.temEstoqueBase ? l.consumido : null,
  }))
  const somaResumo = (campo: 'vendaBruta' | 'entradas' | 'saidas') => resumo.reduce((s, r) => s + r[campo], 0)

  const fmt = (v: number) => formatBRL(v)
  const fmtDelta = (atual: number | null, anterior: number | null) => {
    if (atual === null || anterior === null) return null
    const diff = atual - anterior
    const pct = anterior === 0 ? null : (diff / Math.abs(anterior)) * 100
    return { diff, pct }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📅 Fechamento do Mês</h2>
          <p className="mt-0.5 text-sm text-gray-500">Entradas e saídas, estoque e resultado de cada loja.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/painel/fechamento-mes?mes=${mesAnterior}&loja=${lojaSel}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">← Anterior</a>
          <span className="rounded-lg bg-blue-50 px-4 py-1.5 text-sm font-bold text-blue-700">{nomeMes(mes)}</span>
          <a href={`/painel/fechamento-mes?mes=${mesSeguinte}&loja=${lojaSel}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Próximo →</a>
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-0.5">
            {lojasList.map((l) => (
              <a key={l.id} href={`/painel/fechamento-mes?mes=${mes}&loja=${l.id}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${l.id === lojaSel ? 'bg-[#1B6CA8] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {l.nome}
              </a>
            ))}
          </div>
        </div>
      </div>

      {fechamento && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          ✅ Mês fechado em {new Date(fechamento.fechado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </div>
      )}

      {linha && (
        <div className="space-y-4">
          {/* resultado do mês — 5 cards iguais, cores diferentes */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl bg-gray-100 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-gray-500">Caixa inicial</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{fmt(linha.caixaInicial)}</p>
              <p className="text-[11px] text-gray-400">fim de {nomeMes(mesAnterior)}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-emerald-700">Entrou no mês</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{fmt(linha.entradas)}</p>
              <p className="text-[11px] text-emerald-600">vendas pagas + fiado</p>
            </div>
            <div className="rounded-2xl bg-red-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-red-700">Saiu no mês</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{fmt(linha.saidas)}</p>
              <p className="text-[11px] text-red-600">compras + despesas</p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-blue-700">Dinheiro em mãos (referência)</p>
              <p className="mt-1 text-2xl font-bold text-blue-700">{fmt(linha.caixaCalculado)}</p>
              <p className="text-[11px] text-blue-600">abertura + cédula que entrou − cédula que saiu</p>
            </div>
            <div className={`rounded-2xl p-4 shadow-sm ${linha.resultado >= 0 ? 'bg-emerald-100' : 'bg-amber-100'}`}>
              <p className="text-xs font-semibold uppercase text-gray-600">{linha.resultado >= 0 ? 'Lucro' : 'Prejuízo'}</p>
              <p className={`mt-1 text-2xl font-bold ${linha.resultado >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(Math.abs(linha.resultado))}</p>
              <p className="text-[11px] text-gray-500">entrou − saiu</p>
            </div>
            <div className="rounded-2xl bg-sky-100 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-sky-700">Livre para retirar</p>
              <p className={`mt-1 text-2xl font-bold ${linha.resultadoDisponivel >= 0 ? 'text-sky-800' : 'text-red-700'}`}>{fmt(linha.resultadoDisponivel)}</p>
              <p className="text-[11px] text-sky-700">lucro − crédito de cliente em aberto</p>
            </div>
            <div className="rounded-2xl bg-violet-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-violet-700">🎟️ Crédito de cliente</p>
              <p className="mt-1 text-2xl font-bold text-violet-700">{fmt(linha.creditoAberto)}</p>
              <p className="text-[11px] text-violet-600">a loja deve em peça — não é despesa, é reserva</p>
            </div>
          </div>

          {/* indicadores — 5 cards iguais, cores diferentes */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl bg-purple-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-purple-700">🏷️ Consignado</p>
              <p className="mt-1 text-2xl font-bold text-purple-700">{fmt(linha.consignado)}</p>
              <p className="text-[11px] text-purple-600">dívida a pagar</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-rose-700">🗑️ Perdas</p>
              <p className="mt-1 text-2xl font-bold text-rose-700">{fmt(linha.perdasApp)}</p>
              <p className="text-[11px] text-rose-600">oficial setembro {fmt(linha.perdas)}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-amber-700">🔄 Trocas na rua</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{fmt(linha.trocasNaRua)}</p>
              <p className="text-[11px] text-amber-600">enviadas, não resolvidas</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-emerald-700">💵 Dinheiro em mãos</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{fmt(linha.dinheiroEmMaos)}</p>
              <p className="text-[11px] text-emerald-600">entrou − saiu em dinheiro</p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-sky-700">📦 Estoque consumido</p>
              <p className="mt-1 text-2xl font-bold text-sky-700">{linha.temEstoqueBase ? fmt(linha.consumido) : '—'}</p>
              <p className="text-[11px] text-sky-600">{linha.temEstoqueBase ? 'início − final' : '1º mês, sem base'}</p>
            </div>
          </div>

          {/* comparação com o mês anterior */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-gray-800">↔️ Comparação com {nomeMes(mesAnterior)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">mesma loja · verde = subiu, vermelho = caiu</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(() => {
                const d = fmtDelta(linha.resultado, prevResultado)
                const cor = d ? (d.diff >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400'
                return (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500">{linha.resultado >= 0 ? 'Lucro' : 'Prejuízo'}</p>
                    <p className="mt-1 text-lg font-bold text-gray-800">{fmt(linha.resultado)}</p>
                    {d ? (
                      <p className={'text-[11px] font-semibold ' + cor}>
                        {d.diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(d.diff))} {d.pct !== null ? '(' + (d.diff >= 0 ? '+' : '') + d.pct.toFixed(0) + '%)' : ''}
                      </p>
                    ) : <p className="text-[11px] text-gray-400">sem base</p>}
                  </div>
                )
              })()}
              {(() => {
                const d = fmtDelta(linha.despesas, prevDespesa)
                const cor = d ? (d.diff >= 0 ? 'text-red-600' : 'text-emerald-600') : 'text-gray-400'
                return (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500">Despesa</p>
                    <p className="mt-1 text-lg font-bold text-gray-800">{fmt(linha.despesas)}</p>
                    {d ? (
                      <p className={'text-[11px] font-semibold ' + cor}>
                        {d.diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(d.diff))} {d.pct !== null ? '(' + (d.diff >= 0 ? '+' : '') + d.pct.toFixed(0) + '%)' : ''}
                      </p>
                    ) : <p className="text-[11px] text-gray-400">sem base</p>}
                  </div>
                )
              })()}
              {(() => {
                const d = fmtDelta(linha.temEstoqueBase ? linha.consumido : null, prevConsumido)
                const cor = d ? (d.diff >= 0 ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400'
                return (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500">Estoque consumido</p>
                    <p className="mt-1 text-lg font-bold text-gray-800">{linha.temEstoqueBase ? fmt(linha.consumido) : '—'}</p>
                    {d ? (
                      <p className={'text-[11px] font-semibold ' + cor}>
                        {d.diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(d.diff))} {d.pct !== null ? '(' + (d.diff >= 0 ? '+' : '') + d.pct.toFixed(0) + '%)' : ''}
                      </p>
                    ) : <p className="text-[11px] text-gray-400">sem base</p>}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* detalhes (colapsado pra não poluir) */}
          <details className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer select-none text-sm font-semibold text-gray-600">Ver detalhes</summary>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {/* 💵 DINHEIRO — tabela */}
              <div className="overflow-hidden rounded-xl border border-emerald-200">
                <div className="bg-emerald-600 px-4 py-2 text-sm font-bold text-white">💵 Dinheiro</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td colSpan={2} className="bg-emerald-50 px-4 py-1.5 text-[11px] font-semibold uppercase text-emerald-700">Onde está agora</td></tr>
                    {CAIXA_DET.map(([k, label]) => (
                      <tr key={k} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-600">{label}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">{fmt(linha.caixaDet?.[k] ?? 0)}</td>
                      </tr>
                    ))}
                    <tr><td colSpan={2} className="bg-emerald-50 px-4 py-1.5 text-[11px] font-semibold uppercase text-emerald-700">Movimento do mês</td></tr>
                    <tr className="border-t border-gray-100"><td className="px-4 py-2 text-gray-600">Entrou em dinheiro</td><td className="px-4 py-2 text-right font-semibold tabular-nums text-emerald-700">{fmt(linha.dinheiroEntrou)}</td></tr>
                    <tr className="border-t border-gray-100"><td className="px-4 py-2 text-gray-600">Saiu em dinheiro</td><td className="px-4 py-2 text-right font-semibold tabular-nums text-red-600">{fmt(linha.dinheiroSaiu)}</td></tr>
                    <tr className="border-t border-gray-100 bg-emerald-50/50"><td className="px-4 py-2 font-semibold text-gray-800">Em mãos</td><td className="px-4 py-2 text-right font-bold tabular-nums text-emerald-700">{fmt(linha.dinheiroEmMaos)}</td></tr>
                  </tbody>
                </table>
              </div>

              {/* 📦 ESTOQUE — tabela */}
              <div className="overflow-hidden rounded-xl border border-sky-200">
                <div className="bg-sky-600 px-4 py-2 text-sm font-bold text-white">📦 Estoque</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td colSpan={2} className="bg-sky-50 px-4 py-1.5 text-[11px] font-semibold uppercase text-sky-700">Custo agora (cadastro)</td></tr>
                    <tr className="border-t border-gray-100"><td className="px-4 py-2 text-gray-600">Vitrine (loja)</td><td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">{fmt(linha.estoqueFinalVitrine)}</td></tr>
                    <tr className="border-t border-gray-100"><td className="px-4 py-2 text-gray-600">Fundo (estoque)</td><td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">{fmt(linha.estoqueFinalFundo)}</td></tr>
                    <tr className="border-t border-gray-100"><td className="px-4 py-2 font-semibold text-gray-800">Total agora</td><td className="px-4 py-2 text-right font-bold tabular-nums text-sky-700">{fmt(linha.estoqueFinalTotal)}</td></tr>
                    <tr><td colSpan={2} className="bg-sky-50 px-4 py-1.5 text-[11px] font-semibold uppercase text-sky-700">Comparação com o mês anterior</td></tr>
                    <tr className="border-t border-gray-100"><td className="px-4 py-2 text-gray-600">Início do mês</td><td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">{linha.temEstoqueBase ? fmt(linha.estoqueInicialTotal) : '—'}</td></tr>
                    <tr className="border-t border-gray-100"><td className="px-4 py-2 text-gray-600">Final do mês</td><td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">{fmt(linha.estoqueFinalTotal)}</td></tr>
                    <tr className="border-t border-gray-100 bg-sky-50/50"><td className="px-4 py-2 font-semibold text-gray-800">Consumido</td><td className="px-4 py-2 text-right font-bold tabular-nums text-sky-700">{linha.temEstoqueBase ? fmt(linha.consumido) : '—'}</td></tr>
                  </tbody>
                </table>
              </div>

              {/* 📦 ESTOQUE POR CATEGORIA — tabela largura total */}
              <div className="overflow-hidden rounded-xl border border-slate-200 lg:col-span-2">
                <div className="bg-slate-600 px-4 py-2 text-sm font-bold text-white">📦 Estoque por categoria (abertura oficial)</div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100"><td className="px-4 py-2 text-gray-600">Categoria</td><td className="px-4 py-2 text-right text-gray-500">Valor</td></tr>
                    {CAT_ESTOQUE.map(([k, label]) => (
                      <tr key={k} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-600">{label}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-gray-900">{fmt(linha.estoqueCategorias?.[k] ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {linha.perdasItens.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-rose-200 lg:col-span-2">
                  <div className="bg-rose-600 px-4 py-2 text-sm font-bold text-white">🗑️ Motivos das perdas</div>
                  <div className="divide-y divide-gray-100">
                    {linha.perdasItens.map((it, i) => (
                      <div key={i} className="flex justify-between gap-2 px-4 py-2 text-sm">
                        <span className="truncate text-gray-600">{it.nome}{it.motivo !== '—' ? ' · ' + it.motivo : ''}</span>
                        <span className="shrink-0 tabular-nums font-semibold text-gray-900">{fmt(it.custo)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {avisosFechamento.length > 0 && (          <div className="mb-4 space-y-2">
            {avisosFechamento.map((a, i) => (
              <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-semibold">⚠ Antes de fechar</p>
                <p className="mt-0.5 text-xs leading-snug">{a}</p>
              </div>
            ))}
          </div>
        )}
        <FecharMesButton
          mes={mes}
          fechado={!!fechamento}
          lojas={lojasList.map((l) => ({ id: l.id, nome: l.nome, caixaFinal: 0, caixaCalculado: linhas.find((x) => x.loja === l.id)?.caixaCalculado ?? 0 }))}
        />
        <p className="mt-3 text-xs text-gray-400">Fechar o mês grava o caixa final que você conferiu e congela o estoque. Esse caixa final vira a abertura do mês seguinte. Reabrir desfaz.</p>
      </div>

      {/* ─── RESUMO DO FECHAMENTO — uma folha para imprimir e arquivar ─── */}
      <section id="resumo-fechamento" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Resumo do fechamento — {nomeMes(mes)}</h3>
            <p className="text-xs text-gray-500">
              {fechamento
                ? `Fechado em ${new Date(gravado?.fechado_em as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${gravado?.fechado_por ?? '—'}`
                : 'Mês ainda não fechado — os valores de caixa e estoque finais aparecem depois de fechar.'}
            </p>
          </div>
          <BotaoImprimirResumo />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3">Loja</th>
                <th className="py-2 pr-3 text-right">Venda bruta</th>
                <th className="py-2 pr-3 text-right">Entrou no caixa</th>
                <th className="py-2 pr-3 text-right">Saiu do caixa</th>
                <th className="py-2 pr-3 text-right">Dinheiro em mãos</th>
                <th className="py-2 pr-3 text-right">Estoque final</th>
                <th className="py-2 text-right">Custo das peças vendidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resumo.map((r) => (
                <tr key={r.nome}>
                  <td className="py-2 pr-3 font-medium text-gray-800">{r.nome}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-gray-900">{fmt(r.vendaBruta)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-emerald-700">{fmt(r.entradas)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-red-600">{fmt(r.saidas)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-700">{r.caixaFinal == null ? '—' : fmt(r.caixaFinal)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-700">{r.estoqueFinal == null ? '—' : fmt(r.estoqueFinal.vitrine + r.estoqueFinal.fundo)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-700">{r.consumido == null ? '—' : fmt(r.consumido)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 font-bold text-gray-900">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmt(somaResumo('vendaBruta'))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmt(somaResumo('entradas'))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmt(somaResumo('saidas'))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmt(resumo.reduce((s, r) => s + ((r.caixaFinal ?? 0)), 0))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmt(resumo.reduce((s, r) => s + (r.estoqueFinal ? r.estoqueFinal.vitrine + r.estoqueFinal.fundo : 0), 0))}</td>
                <td className="py-2 text-right tabular-nums">{fmt(resumo.reduce((s, r) => s + (r.consumido ?? 0), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase text-gray-500">Devoluções do mês</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{fmt(totalDevolucoes)}</p>
            <p className="text-[11px] text-gray-500">{totalDevolucoes > 0 && somaResumo('entradas') > 0 ? `${((totalDevolucoes / somaResumo('entradas')) * 100).toFixed(1)}% do que entrou` : '—'}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase text-gray-500">Comissão e meta ({nomeMes(mesSeguinte)})</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{fmt(totalComissaoProximo)}</p>
            <p className="text-[11px] text-gray-500">a pagar no mês seguinte</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase text-gray-500">Contas a pagar em aberto</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-amber-700">{fmt(totalEmAberto)}</p>
            <p className="text-[11px] text-gray-500">fornecedor, INOVA, parcelas e o que rolou do mês</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase text-gray-500">Dinheiro em mãos</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-gray-900">{fmt(resumo.reduce((s, r) => s + ((r.caixaFinal ?? 0)), 0))}</p>
            <p className="text-[11px] text-gray-500">vira a abertura de {nomeMes(mesSeguinte)}</p>
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-snug text-gray-400">
          Entrou = venda recebida no mês + fiado cobrado. Saiu = compras + despesas pagas. Dinheiro em mãos e estoque final são os valores
          gravados no fechamento. Devoluções contam pelo dia em que foram registradas.
        </p>
      </section>
    </div>
  )
}

