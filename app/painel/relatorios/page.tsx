import { IconChart } from '@/components/icons'
import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { formatDate, hojeSP } from '@/lib/utils'
import { ExportCsv } from './ExportCsv'
import { ExportCsvLazy } from './ExportCsvLazy'
import { FluxoChart, ParetoChart, Donut, Barra } from './Charts'

const AMOSTRA = 200  // abas pesadas mostram só as primeiras N linhas; CSV sai completo

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const asRows = (a: unknown[]) => a as unknown as Record<string, unknown>[]

type ItemVenda = {
  quantidade: number
  preco_unitario: number
  total_item: number
  produto_id: string
  produtos: { nome: string; preco_custo: number | null } | null
  vendas: { created_at: string; status: string; pessoa_id: string | null } | null
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; de?: string; ate?: string }>
}) {
  const { aba = 'financeiro', de, ate } = await searchParams
  const supabase = await createServiceClient()

  const hoje = hojeSP()
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dataInicio = de ?? inicioMes
  const dataFim = ate ?? hoje
  const periodo = { inicio: dataInicio + 'T00:00:00', fim: dataFim + 'T23:59:59' }

  const precisaItens = ['lucro', 'produtos', 'abc', 'dre'].includes(aba)
  const precisaClientes = ['produtos', 'abc'].includes(aba)

  // ---------- Financeiro (lançamentos por vencimento) ----------
  let lancamentos: { tipo: string; status: string; valor: number; data_vencimento: string; descricao: string; pessoa_nome: string }[] = []
  if (aba === 'financeiro') {
    lancamentos = await fetchAll<{ tipo: string; status: string; valor: number; data_vencimento: string; descricao: string; pessoa_nome: string }>((from, to) => supabase.from('lancamentos')
      .select('tipo, status, valor, data_vencimento, descricao, pessoa_nome')
      .gte('data_vencimento', dataInicio).lte('data_vencimento', dataFim + 'T23:59:59')
      .order('data_vencimento').range(from, to))
  }
  const totalReceber = lancamentos.filter((l) => l.tipo === 'receber').reduce((s, l) => s + l.valor, 0)
  const totalPagar = lancamentos.filter((l) => l.tipo === 'pagar').reduce((s, l) => s + l.valor, 0)

  // ---------- Vendas (lista) ----------
  let vendasLista: { id: string; total: number; desconto: number; created_at: string; status: string }[] = []
  if (aba === 'vendas') {
    vendasLista = await fetchAll<{ id: string; total: number; desconto: number; created_at: string; status: string }>((from, to) => supabase.from('vendas')
      .select('id, total, desconto, created_at, status')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim)
      .order('created_at', { ascending: false }).range(from, to))
  }
  const totalVendasLista = vendasLista.reduce((s, v) => s + v.total, 0)

  // ---------- Itens de venda do período (Lucro, Produtos, ABC, DRE) ----------
  type ProdAgg = { nome: string; qtd: number; vendido: number; custo: number }
  const porProduto: Record<string, ProdAgg> = {}
  let totalVendidoItens = 0, totalCustoItens = 0
  if (precisaItens) {
    const data = await fetchAll((from, to) => supabase.from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produto_id, produtos(nome, preco_custo), vendas!inner(created_at, status, pessoa_id)')
      .eq('vendas.status', 'concluida')
      .gte('vendas.created_at', periodo.inicio).lte('vendas.created_at', periodo.fim).range(from, to))
    for (const it of (data ?? []) as unknown as ItemVenda[]) {
      const nome = it.produtos?.nome ?? '—'
      const custoLinha = (it.produtos?.preco_custo ?? 0) * it.quantidade
      const vendidoLinha = it.total_item ?? it.preco_unitario * it.quantidade
      if (!porProduto[it.produto_id]) porProduto[it.produto_id] = { nome, qtd: 0, vendido: 0, custo: 0 }
      porProduto[it.produto_id].qtd += it.quantidade
      porProduto[it.produto_id].vendido += vendidoLinha
      porProduto[it.produto_id].custo += custoLinha
      totalVendidoItens += vendidoLinha
      totalCustoItens += custoLinha
    }
  }
  const lucroTotal = totalVendidoItens - totalCustoItens
  const margemTotal = totalVendidoItens > 0 ? (lucroTotal / totalVendidoItens) * 100 : 0
  const rankLucro = Object.values(porProduto)
    .map((p) => ({ ...p, lucro: p.vendido - p.custo, margem: p.vendido > 0 ? ((p.vendido - p.custo) / p.vendido) * 100 : 0 }))
    .sort((a, b) => b.lucro - a.lucro)
  const rankQtd = Object.values(porProduto).slice().sort((a, b) => b.qtd - a.qtd)
  const rankValorProd = Object.values(porProduto).slice().sort((a, b) => b.vendido - a.vendido)

  // ---------- Clientes (Produtos, ABC) ----------
  type CliAgg = { nome: string; qtd: number; total: number }
  const porCliente: Record<string, CliAgg> = {}
  if (precisaClientes) {
    const data = await fetchAll((from, to) => supabase.from('vendas')
      .select('total, pessoa_id, pessoas(nome)').eq('status', 'concluida')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).range(from, to))
    for (const v of (data ?? []) as unknown as { total: number; pessoa_id: string | null; pessoas: { nome: string } | null }[]) {
      const key = v.pessoa_id ?? 'sem'
      const nome = v.pessoas?.nome ?? 'Sem cliente'
      if (!porCliente[key]) porCliente[key] = { nome, qtd: 0, total: 0 }
      porCliente[key].qtd++
      porCliente[key].total += v.total ?? 0
    }
  }
  const rankClientes = Object.values(porCliente).sort((a, b) => b.total - a.total)
  const maxQtd = rankQtd[0]?.qtd || 1
  const maxCli = rankClientes[0]?.total || 1
  const maxLuc = Math.max(...rankLucro.map((p) => p.lucro), 1)

  // Curva ABC: acumula % do total e classifica A(≤80) B(≤95) C(resto)
  function classificarABC<T extends { valor: number }>(items: T[]): (T & { pctAcum: number; classe: 'A' | 'B' | 'C' })[] {
    const total = items.reduce((s, i) => s + i.valor, 0)
    let cum = 0
    return items.map((it) => {
      cum += it.valor
      const pctAcum = total > 0 ? (cum / total) * 100 : 0
      const classe: 'A' | 'B' | 'C' = pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C'
      return { ...it, pctAcum, classe }
    })
  }
  const abcProdutos = aba === 'abc'
    ? classificarABC(rankValorProd.map((p) => ({ nome: p.nome, qtd: p.qtd, valor: p.vendido })))
    : []
  const abcClientes = aba === 'abc'
    ? classificarABC(rankClientes.map((c) => ({ nome: c.nome, qtd: c.qtd, valor: c.total })))
    : []
  const contaClasse = (arr: { classe: string }[], c: string) => arr.filter((x) => x.classe === c).length

  // ---------- Inadimplência (fiado vencido) ----------
  type Inad = { pessoa: string; emAberto: number; titulos: number; diasAtraso: number; telefone: string | null }
  let inadimplentes: Inad[] = []
  let totalInad = 0
  if (aba === 'inadimplencia') {
    const [{ data }, pessoasData] = await Promise.all([
      supabase.from('lancamentos')
        .select('valor, valor_pago, data_vencimento, pessoa_nome')
        .eq('tipo', 'receber').eq('status', 'pendente')
        .lt('data_vencimento', hoje),
      fetchAll((from, to) => supabase.from('pessoas').select('nome, telefone, celular').range(from, to)),
    ])
    // mapa nome → telefone (pra cobrar direto pelo relatório)
    const telPorNome: Record<string, string> = {}
    for (const p of (pessoasData ?? []) as { nome: string | null; telefone: string | null; celular: string | null }[]) {
      const tel = (p.celular || p.telefone || '').trim()
      if (p.nome && tel) telPorNome[p.nome.trim().toLowerCase()] = tel
    }
    const mapa: Record<string, Inad> = {}
    const agora = Date.now()
    for (const l of (data ?? []) as { valor: number; valor_pago: number | null; data_vencimento: string | null; pessoa_nome: string | null }[]) {
      const pessoa = l.pessoa_nome || 'Sem cliente'
      const aberto = (l.valor ?? 0) - (l.valor_pago ?? 0)
      if (aberto <= 0) continue
      const dias = l.data_vencimento ? Math.floor((agora - new Date(l.data_vencimento).getTime()) / 86400000) : 0
      if (!mapa[pessoa]) mapa[pessoa] = { pessoa, emAberto: 0, titulos: 0, diasAtraso: 0, telefone: telPorNome[pessoa.trim().toLowerCase()] ?? null }
      mapa[pessoa].emAberto += aberto
      mapa[pessoa].titulos++
      mapa[pessoa].diasAtraso = Math.max(mapa[pessoa].diasAtraso, dias)
    }
    inadimplentes = Object.values(mapa).sort((a, b) => b.emAberto - a.emAberto)
    totalInad = inadimplentes.reduce((s, i) => s + i.emAberto, 0)
  }

  // ---------- DRE (resultado do período) ----------
  let dreReceita = 0, dreDespesas = 0
  let despesasPorCategoria: { categoria: string; valor: number }[] = []
  if (aba === 'dre') {
    const vs = await fetchAll<{ total: number | null }>((from, to) => supabase.from('vendas').select('total').eq('status', 'concluida')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).range(from, to))
    dreReceita = (vs ?? []).reduce((s, v) => s + (v.total ?? 0), 0)
    const ds = await fetchAll<{ valor: number; categoria: string | null }>((from, to) => supabase.from('lancamentos').select('valor, categoria')
      .eq('tipo', 'pagar').gte('data_vencimento', dataInicio).lte('data_vencimento', dataFim + 'T23:59:59').range(from, to))
    const catMap: Record<string, number> = {}
    for (const l of (ds ?? []) as { valor: number; categoria: string | null }[]) {
      dreDespesas += l.valor ?? 0
      const cat = (l.categoria || 'Sem categoria').trim()
      catMap[cat] = (catMap[cat] ?? 0) + (l.valor ?? 0)
    }
    despesasPorCategoria = Object.entries(catMap).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor)
  }
  const dreCmv = totalCustoItens
  const dreLucroBruto = dreReceita - dreCmv
  const dreResultado = dreLucroBruto - dreDespesas

  // ---------- Fluxo de Caixa (por dia) ----------
  type DiaFluxo = { dia: string; entrada: number; saida: number; saldo: number; acumulado: number }
  let fluxo: DiaFluxo[] = []
  let fluxoEntradas = 0, fluxoSaidas = 0
  if (aba === 'fluxo') {
    const [vs, ps] = await Promise.all([
      fetchAll<{ total: number; created_at: string }>((from, to) => supabase.from('vendas').select('total, created_at').eq('status', 'concluida')
        .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).range(from, to)),
      fetchAll<{ valor: number; data_pagamento: string | null }>((from, to) => supabase.from('lancamentos').select('valor, data_pagamento').eq('tipo', 'pagar').eq('status', 'pago')
        .gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim + 'T23:59:59').range(from, to)),
    ])
    const dias: Record<string, { entrada: number; saida: number }> = {}
    for (const v of (vs ?? []) as { total: number; created_at: string }[]) {
      const d = v.created_at.slice(0, 10)
      ;(dias[d] ??= { entrada: 0, saida: 0 }).entrada += v.total ?? 0
    }
    for (const p of (ps ?? []) as { valor: number; data_pagamento: string | null }[]) {
      const d = (p.data_pagamento ?? '').slice(0, 10)
      if (!d) continue
      ;(dias[d] ??= { entrada: 0, saida: 0 }).saida += p.valor ?? 0
    }
    let acc = 0
    fluxo = Object.entries(dias).sort(([a], [b]) => a.localeCompare(b)).map(([dia, v]) => {
      const saldo = v.entrada - v.saida
      acc += saldo
      fluxoEntradas += v.entrada
      fluxoSaidas += v.saida
      return { dia, entrada: v.entrada, saida: v.saida, saldo, acumulado: acc }
    })
  }

  // ---------- Estoque (valor + crítico + previsão de compra) ----------
  type EstRow = { produto_id: string; nome: string; quantidade: number; deposito: string; preco: number; custo: number; minimo: number }
  let estoque: EstRow[] = []
  let valorCusto = 0, valorVenda = 0
  let criticos: { nome: string; qtd: number; minimo: number }[] = []
  let previsao: { nome: string; estoque: number; vendido30: number; sugestao: number }[] = []
  if (aba === 'estoque') {
    const data = await fetchAll((from, to) => supabase.from('estoque')
      .select('produto_id, quantidade, produtos(nome, preco, preco_custo, estoque_minimo, ativo), depositos(nome)')
      .gt('quantidade', 0).range(from, to))
    estoque = (data ?? []).map((e) => {
      const p = e.produtos as unknown as { nome: string; preco: number; preco_custo: number | null; estoque_minimo: number | null; ativo: boolean } | null
      return {
        produto_id: e.produto_id, nome: p?.nome ?? '—', preco: p?.preco ?? 0, custo: p?.preco_custo ?? 0,
        minimo: p?.estoque_minimo ?? 0, quantidade: e.quantidade,
        deposito: (e.depositos as unknown as { nome: string } | null)?.nome ?? '—',
      }
    }).sort((a, b) => b.quantidade * b.custo - a.quantidade * a.custo)
    valorCusto = estoque.reduce((s, e) => s + e.quantidade * e.custo, 0)
    valorVenda = estoque.reduce((s, e) => s + e.quantidade * e.preco, 0)

    // total por produto (soma depósitos)
    const totPorProd: Record<string, { nome: string; qtd: number; minimo: number }> = {}
    for (const e of estoque) {
      if (!totPorProd[e.produto_id]) totPorProd[e.produto_id] = { nome: e.nome, qtd: 0, minimo: e.minimo }
      totPorProd[e.produto_id].qtd += e.quantidade
    }
    criticos = Object.values(totPorProd).filter((p) => p.minimo > 0 && p.qtd <= p.minimo)
      .map((p) => ({ nome: p.nome, qtd: p.qtd, minimo: p.minimo }))
      .sort((a, b) => a.qtd - b.qtd)

    // Previsão de compra: vendas dos últimos 30 dias × estoque atual
    const limite30 = new Date(Date.now() - 30 * 86400000).toISOString()
    const v30 = await fetchAll((from, to) => supabase.from('itens_venda')
      .select('quantidade, produto_id, vendas!inner(created_at, status)')
      .eq('vendas.status', 'concluida').gte('vendas.created_at', limite30).range(from, to))
    const vendido30: Record<string, number> = {}
    for (const it of (v30 ?? []) as unknown as { quantidade: number; produto_id: string }[]) {
      vendido30[it.produto_id] = (vendido30[it.produto_id] ?? 0) + it.quantidade
    }
    previsao = Object.entries(totPorProd)
      .map(([id, p]) => ({ nome: p.nome, estoque: p.qtd, vendido30: vendido30[id] ?? 0 }))
      .filter((p) => p.vendido30 > 0 && p.estoque < p.vendido30) // gira mais do que tem em estoque
      .map((p) => ({ ...p, sugestao: Math.max(0, Math.ceil(p.vendido30 - p.estoque)) }))
      .sort((a, b) => b.sugestao - a.sugestao)
  }

  // ---------- Formas de pagamento ----------
  let rankFormas: { nome: string; total: number; qtd: number }[] = []
  let totalFormas = 0
  if (aba === 'formas') {
    const vs = await fetchAll<{ id: string }>((from, to) => supabase.from('vendas').select('id').eq('status', 'concluida')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).range(from, to))
    const ids = (vs ?? []).map((v) => v.id)
    if (ids.length) {
      const [pgs, { data: formas }] = await Promise.all([
        fetchAllIn<{ valor: number; forma_pagamento_id: string | null }>(ids, (chunk, from, to) => supabase.from('pagamentos_venda').select('valor, forma_pagamento_id').in('venda_id', chunk).range(from, to)),
        supabase.from('formas_pagamento').select('id, nome'),
      ])
      const nomeF = Object.fromEntries((formas ?? []).map((f) => [f.id, f.nome]))
      const mapa: Record<string, { total: number; qtd: number }> = {}
      for (const p of (pgs ?? []) as { valor: number; forma_pagamento_id: string | null }[]) {
        const nome = (p.forma_pagamento_id && nomeF[p.forma_pagamento_id]) || 'Não informado'
        ;(mapa[nome] ??= { total: 0, qtd: 0 }).total += p.valor ?? 0
        mapa[nome].qtd++
      }
      rankFormas = Object.entries(mapa).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.total - a.total)
      totalFormas = rankFormas.reduce((s, f) => s + f.total, 0)
    }
  }

  // ---------- Vendas por loja ----------
  let rankLojas: { nome: string; total: number; qtd: number }[] = []
  if (aba === 'porloja') {
    const [vs, { data: lojasData }] = await Promise.all([
      fetchAll((from, to) => supabase.from('vendas').select('total, deposito_id, depositos(nome, loja_id)').eq('status', 'concluida')
        .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).range(from, to)),
      supabase.from('lojas').select('id, nome'),
    ])
    const nomeLoja = Object.fromEntries((lojasData ?? []).map((l) => [l.id, l.nome]))
    const mapa: Record<string, { total: number; qtd: number }> = {}
    for (const v of (vs ?? []) as unknown as { total: number; depositos: { nome: string; loja_id: string | null } | null }[]) {
      const loja = (v.depositos?.loja_id && nomeLoja[v.depositos.loja_id]) || v.depositos?.nome || 'Sem loja'
      ;(mapa[loja] ??= { total: 0, qtd: 0 }).total += v.total ?? 0
      mapa[loja].qtd++
    }
    rankLojas = Object.entries(mapa).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.total - a.total)
  }

  // ---------- Vendas por vendedor ----------
  let rankVendedores: { nome: string; total: number; qtd: number }[] = []
  if (aba === 'porvendedor') {
    const data = await fetchAll<{ total: number; vendedor_nome: string | null }>((from, to) => supabase.from('vendas').select('total, vendedor_nome').eq('status', 'concluida')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).range(from, to))
    const mapa: Record<string, { total: number; qtd: number }> = {}
    for (const v of (data ?? []) as { total: number; vendedor_nome: string | null }[]) {
      const nome = v.vendedor_nome || 'Sem vendedor'
      ;(mapa[nome] ??= { total: 0, qtd: 0 }).total += v.total ?? 0
      mapa[nome].qtd++
    }
    rankVendedores = Object.entries(mapa).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.total - a.total)
  }

  // ---------- Periodicidade (dia da semana) ----------
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  let periodicidade: { dia: string; total: number; qtd: number }[] = []
  if (aba === 'periodicidade') {
    const data = await fetchAll<{ total: number; created_at: string }>((from, to) => supabase.from('vendas').select('total, created_at').eq('status', 'concluida')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).range(from, to))
    const buckets = DIAS.map((dia) => ({ dia, total: 0, qtd: 0 }))
    for (const v of (data ?? []) as { total: number; created_at: string }[]) {
      const wd = new Date(new Date(v.created_at).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay()
      buckets[wd].total += v.total ?? 0
      buckets[wd].qtd++
    }
    periodicidade = buckets
  }
  const maxPeriodo = Math.max(...periodicidade.map((p) => p.total), 1)

  // ---------- Clientes inativos (compraram mas sumiram há 60+ dias) ----------
  let inativos: { nome: string; ultima: string; dias: number }[] = []
  if (aba === 'inativos') {
    const [vs, ps] = await Promise.all([
      fetchAll<{ pessoa_id: string; created_at: string }>((from, to) => supabase.from('vendas').select('pessoa_id, created_at').eq('status', 'concluida').not('pessoa_id', 'is', null).range(from, to)),
      fetchAll((from, to) => supabase.from('pessoas').select('id, nome').in('tipo', ['cliente', 'ambos']).eq('ativo', true).range(from, to)),
    ])
    const ultimaPorPessoa: Record<string, string> = {}
    for (const v of (vs ?? []) as { pessoa_id: string; created_at: string }[]) {
      if (!ultimaPorPessoa[v.pessoa_id] || v.created_at > ultimaPorPessoa[v.pessoa_id]) ultimaPorPessoa[v.pessoa_id] = v.created_at
    }
    const nomeP = Object.fromEntries((ps ?? []).map((p) => [p.id, p.nome]))
    const agora = Date.now()
    inativos = Object.entries(ultimaPorPessoa)
      .map(([id, ultima]) => ({ nome: nomeP[id], ultima, dias: Math.floor((agora - new Date(ultima).getTime()) / 86400000) }))
      .filter((x) => x.nome && x.dias >= 60)
      .sort((a, b) => b.dias - a.dias)
  }

  // ---------- Aniversariantes do mês ----------
  let aniversariantes: { nome: string; dia: number; telefone: string | null }[] = []
  if (aba === 'aniversarios') {
    const mesAtual = new Date().getMonth() + 1
    const data = await fetchAll((from, to) => supabase.from('pessoas').select('nome, data_nascimento, telefone, celular').not('data_nascimento', 'is', null).range(from, to))
    aniversariantes = (data ?? [])
      .map((p) => {
        const d = new Date((p.data_nascimento as string) + 'T12:00:00')
        return { nome: p.nome as string, mes: d.getMonth() + 1, dia: d.getDate(), telefone: (p.telefone as string) || (p.celular as string) || null }
      })
      .filter((p) => p.mes === mesAtual)
      .sort((a, b) => a.dia - b.dia)
  }

  // ---------- Comissões (por vendedor, % global) ----------
  let comissoes: { nome: string; vendido: number; comissao: number }[] = []
  let comissaoPctG = 0, totalComissao = 0
  if (aba === 'comissoes') {
    const [{ data: cfg }, vs] = await Promise.all([
      supabase.from('configuracoes').select('valor').eq('chave', 'pdv').maybeSingle(),
      fetchAll<{ total: number; vendedor_nome: string | null }>((from, to) => supabase.from('vendas').select('total, vendedor_nome').eq('status', 'concluida')
        .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).range(from, to)),
    ])
    comissaoPctG = Number((cfg?.valor as Record<string, number> | null)?.comissao_percentual ?? 0)
    const mapa: Record<string, number> = {}
    for (const v of (vs ?? []) as { total: number; vendedor_nome: string | null }[]) {
      const nome = v.vendedor_nome || 'Sem vendedor'
      mapa[nome] = (mapa[nome] ?? 0) + (v.total ?? 0)
    }
    comissoes = Object.entries(mapa).map(([nome, vendido]) => ({ nome, vendido, comissao: vendido * comissaoPctG / 100 })).sort((a, b) => b.comissao - a.comissao)
    totalComissao = comissoes.reduce((s, c) => s + c.comissao, 0)
  }

  // ---------- Previsão de Caixa (lançamentos futuros pendentes) ----------
  let prevCaixa: { data: string; descricao: string; tipo: string; valor: number; saldo: number }[] = []
  let prevReceber = 0, prevPagar = 0
  if (aba === 'previsaocaixa') {
    const data = await fetchAll<{ descricao: string | null; valor: number | null; valor_pago: number | null; tipo: string; data_vencimento: string }>((from, to) => supabase.from('lancamentos')
      .select('descricao, valor, valor_pago, tipo, data_vencimento')
      .eq('status', 'pendente').gte('data_vencimento', hoje).order('data_vencimento').range(from, to))
    let saldo = 0
    prevCaixa = (data ?? []).map((l) => {
      const rest = (l.valor ?? 0) - (l.valor_pago ?? 0)
      const signed = l.tipo === 'receber' ? rest : -rest
      saldo += signed
      if (l.tipo === 'receber') prevReceber += rest; else prevPagar += rest
      return { data: l.data_vencimento as string, descricao: (l.descricao as string) || '—', tipo: l.tipo as string, valor: signed, saldo }
    })
  }

  // ---------- Comparativo (período atual × anterior) ----------
  type Comp = { receita: number; despesas: number; nvendas: number }
  let compAtual: Comp = { receita: 0, despesas: 0, nvendas: 0 }
  let compAnt: Comp = { receita: 0, despesas: 0, nvendas: 0 }
  if (aba === 'comparativo') {
    const msLen = new Date(dataFim + 'T23:59:59').getTime() - new Date(dataInicio + 'T00:00:00').getTime()
    const prevFim = new Date(new Date(dataInicio + 'T00:00:00').getTime() - 1)
    const prevIni = new Date(prevFim.getTime() - msLen)
    const janela = async (ini: string, fim: string): Promise<Comp> => {
      const [vs, ds] = await Promise.all([
        fetchAll<{ total: number | null }>((from, to) => supabase.from('vendas').select('total').eq('status', 'concluida').gte('created_at', ini).lte('created_at', fim).range(from, to)),
        fetchAll<{ valor: number | null }>((from, to) => supabase.from('lancamentos').select('valor').eq('tipo', 'pagar').gte('data_vencimento', ini.slice(0, 10)).lte('data_vencimento', fim.slice(0, 10) + 'T23:59:59').range(from, to)),
      ])
      return { receita: (vs ?? []).reduce((s, v) => s + (v.total ?? 0), 0), despesas: (ds ?? []).reduce((s, l) => s + (l.valor ?? 0), 0), nvendas: (vs ?? []).length }
    }
    compAtual = await janela(periodo.inicio, periodo.fim)
    compAnt = await janela(prevIni.toISOString(), prevFim.toISOString())
  }
  const variacao = (a: number, b: number) => b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100

  // ---------- Itens por vendedor ----------
  let itensVendedor: { vendedor: string; itens: { nome: string; qtd: number; valor: number }[] }[] = []
  if (aba === 'itensvendedor') {
    const data = await fetchAll((from, to) => supabase.from('itens_venda')
      .select('quantidade, total_item, produtos(nome), vendas!inner(vendedor_nome, status, created_at)')
      .eq('vendas.status', 'concluida').gte('vendas.created_at', periodo.inicio).lte('vendas.created_at', periodo.fim).range(from, to))
    const mapa: Record<string, Record<string, { nome: string; qtd: number; valor: number }>> = {}
    for (const it of (data ?? []) as unknown as { quantidade: number; total_item: number; produtos: { nome: string } | null; vendas: { vendedor_nome: string | null } | null }[]) {
      const vend = it.vendas?.vendedor_nome || 'Sem vendedor'
      const nome = it.produtos?.nome ?? '—'
      const m = (mapa[vend] ??= {})
      ;(m[nome] ??= { nome, qtd: 0, valor: 0 }).qtd += it.quantidade
      m[nome].valor += it.total_item ?? 0
    }
    itensVendedor = Object.entries(mapa).map(([vendedor, prods]) => ({
      vendedor, itens: Object.values(prods).sort((a, b) => b.qtd - a.qtd).slice(0, 8),
    })).sort((a, b) => b.itens.reduce((s, i) => s + i.valor, 0) - a.itens.reduce((s, i) => s + i.valor, 0))
  }

  // ---------- Precificação (lista de preços) ----------
  let precos: { nome: string; custo: number; preco: number; minimo: number; margem: number }[] = []
  if (aba === 'precificacao') {
    const data = await fetchAll((from, to) => supabase.from('produtos').select('nome, preco, preco_custo, preco_minimo').eq('ativo', true).order('nome').range(from, to))
    precos = (data ?? []).map((p) => {
      const custo = p.preco_custo ?? 0, preco = p.preco ?? 0
      return { nome: p.nome as string, custo, preco, minimo: (p as { preco_minimo?: number | null }).preco_minimo ?? 0, margem: custo > 0 ? ((preco - custo) / custo) * 100 : 0 }
    })
  }

  // ---------- Pedidos / Orçamentos ----------
  let pedidosLista: { numero: number | null; tipo: string; status: string; total: number; created_at: string; cliente: string }[] = []
  const pedidosResumo: Record<string, number> = {}
  if (aba === 'pedidos') {
    const { data } = await supabase.from('pedidos')
      .select('numero, tipo, status, total, created_at, pessoas(nome)')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim).order('created_at', { ascending: false }).limit(300)
    pedidosLista = (data ?? []).map((p) => {
      const st = (p.status as string) || 'rascunho'
      pedidosResumo[st] = (pedidosResumo[st] ?? 0) + 1
      return { numero: p.numero as number | null, tipo: (p.tipo as string) || 'orcamento', status: st, total: (p.total as number) ?? 0, created_at: p.created_at as string, cliente: (p.pessoas as unknown as { nome: string } | null)?.nome ?? '—' }
    })
  }

  // ---------- Entrada de Produtos (compras por período) ----------
  let entradas: { nome: string; qtd: number; valor: number }[] = []
  let totalEntradas = 0
  if (aba === 'entradas') {
    const { data: notas } = await supabase.from('notas_entrada').select('id').eq('status', 'recebida')
      .gte('data_entrada', dataInicio).lte('data_entrada', dataFim + 'T23:59:59')
    const ids = (notas ?? []).map((n) => n.id)
    if (ids.length) {
      const { data } = await supabase.from('itens_nota_entrada')
        .select('quantidade, total_item, preco_unitario, produtos(nome)').in('nota_id', ids)
      const mapa: Record<string, { nome: string; qtd: number; valor: number }> = {}
      for (const it of (data ?? []) as unknown as { quantidade: number; total_item: number | null; preco_unitario: number; produtos: { nome: string } | null }[]) {
        const nome = it.produtos?.nome ?? '—'
        ;(mapa[nome] ??= { nome, qtd: 0, valor: 0 }).qtd += it.quantidade
        mapa[nome].valor += it.total_item ?? it.preco_unitario * it.quantidade
      }
      entradas = Object.values(mapa).sort((a, b) => b.valor - a.valor)
      totalEntradas = entradas.reduce((s, e) => s + e.valor, 0)
    }
  }

  // ---------- Produtos por Fornecedor ----------
  let porFornecedor: { fornecedor: string; produtos: number }[] = []
  if (aba === 'porfornecedor') {
    const data = await fetchAll((from, to) => supabase.from('produtos').select('fornecedor_id, pessoas(nome)').eq('ativo', true).range(from, to))
    const mapa: Record<string, number> = {}
    for (const p of (data ?? []) as unknown as { fornecedor_id: string | null; pessoas: { nome: string } | null }[]) {
      const f = p.pessoas?.nome || 'Sem fornecedor'
      mapa[f] = (mapa[f] ?? 0) + 1
    }
    porFornecedor = Object.entries(mapa).map(([fornecedor, produtos]) => ({ fornecedor, produtos })).sort((a, b) => b.produtos - a.produtos)
  }

  // ---------- Inventário (folha de contagem) ----------
  let inventario: { nome: string; deposito: string; sistema: number; custo: number }[] = []
  if (aba === 'inventario') {
    const data = await fetchAll((from, to) => supabase.from('estoque').select('quantidade, produtos(nome, preco_custo), depositos(nome)').gt('quantidade', 0).range(from, to))
    inventario = (data ?? []).map((e) => ({
      nome: (e.produtos as unknown as { nome: string } | null)?.nome ?? '—',
      deposito: (e.depositos as unknown as { nome: string } | null)?.nome ?? '—',
      sistema: e.quantidade, custo: (e.produtos as unknown as { preco_custo: number | null } | null)?.preco_custo ?? 0,
    })).sort((a, b) => a.nome.localeCompare(b.nome))
  }

  // ---------- Movimentações x Saldo ----------
  let movSaldo: { nome: string; entradas: number; saidas: number; saldo: number }[] = []
  if (aba === 'movsaldo') {
    const [{ data: movs }, est] = await Promise.all([
      supabase.from('movimentacoes_estoque').select('produto_id, operacao, quantidade, produtos(nome)')
        .gte('created_at', periodo.inicio).lte('created_at', periodo.fim),
      fetchAll((from, to) => supabase.from('estoque').select('produto_id, quantidade').range(from, to)),
    ])
    const saldoAtual: Record<string, number> = {}
    for (const e of (est ?? []) as { produto_id: string; quantidade: number }[]) saldoAtual[e.produto_id] = (saldoAtual[e.produto_id] ?? 0) + e.quantidade
    const mapa: Record<string, { nome: string; entradas: number; saidas: number }> = {}
    for (const m of (movs ?? []) as unknown as { produto_id: string; operacao: string; quantidade: number; produtos: { nome: string } | null }[]) {
      const nome = m.produtos?.nome ?? '—'
      const e = (mapa[m.produto_id] ??= { nome, entradas: 0, saidas: 0 })
      if (m.operacao === 'entrada') e.entradas += m.quantidade
      else if (m.operacao === 'saida') e.saidas += m.quantidade
    }
    movSaldo = Object.entries(mapa).map(([id, v]) => ({ ...v, saldo: saldoAtual[id] ?? 0 })).sort((a, b) => (b.entradas + b.saidas) - (a.entradas + a.saidas))
  }

  // ---------- Performance de Técnicos (OS) ----------
  let tecnicos: { nome: string; os: number; total: number; concluidas: number }[] = []
  if (aba === 'tecnicos') {
    const { data } = await supabase.from('ordens_servico').select('tecnico_nome, status, total')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim)
    const mapa: Record<string, { nome: string; os: number; total: number; concluidas: number }> = {}
    for (const o of (data ?? []) as { tecnico_nome: string | null; status: string | null; total: number | null }[]) {
      const nome = o.tecnico_nome || 'Sem técnico'
      const t = (mapa[nome] ??= { nome, os: 0, total: 0, concluidas: 0 })
      t.os++
      t.total += o.total ?? 0
      if ((o.status ?? '').toLowerCase().includes('conclu') || (o.status ?? '').toLowerCase().includes('entreg')) t.concluidas++
    }
    tecnicos = Object.values(mapa).sort((a, b) => b.os - a.os)
  }

  // ---------- Contatos (agenda) ----------
  let contatos: { nome: string; telefone: string; cidade: string; tipo: string }[] = []
  if (aba === 'contatos') {
    const data = await fetchAll((from, to) => supabase.from('pessoas').select('nome, telefone, celular, cidade, tipo').eq('ativo', true).order('nome').range(from, to))
    contatos = (data ?? []).map((p) => ({
      nome: p.nome as string, telefone: (p.celular as string) || (p.telefone as string) || '—',
      cidade: (p.cidade as string) || '—', tipo: (p.tipo as string) || '—',
    })).filter((p) => p.telefone !== '—')
  }

  const categorias: { cat: string; abas: { id: string; label: string }[] }[] = [
    { cat: 'Financeiro', abas: [
      { id: 'financeiro', label: 'Lançamentos' }, { id: 'fluxo', label: 'Fluxo de Caixa' },
      { id: 'dre', label: 'DRE' }, { id: 'inadimplencia', label: 'Inadimplência' },
      { id: 'comissoes', label: 'Comissões' }, { id: 'previsaocaixa', label: 'Previsão de Caixa' },
      { id: 'comparativo', label: 'Comparativo' },
    ] },
    { cat: 'Vendas', abas: [
      { id: 'vendas', label: 'Vendas' }, { id: 'lucro', label: 'Lucro' }, { id: 'produtos', label: 'Mais vendidos' },
      { id: 'abc', label: 'Curva ABC' }, { id: 'formas', label: 'Formas de pgto' }, { id: 'porloja', label: 'Por loja' },
      { id: 'porvendedor', label: 'Por vendedor' }, { id: 'itensvendedor', label: 'Itens por vendedor' },
      { id: 'periodicidade', label: 'Periodicidade' }, { id: 'precificacao', label: 'Precificação' },
      { id: 'pedidos', label: 'Pedidos' },
    ] },
    { cat: 'Compras', abas: [{ id: 'entradas', label: 'Entrada de Produtos' }] },
    { cat: 'Estoque', abas: [
      { id: 'estoque', label: 'Estoque e compra' }, { id: 'porfornecedor', label: 'Por fornecedor' },
      { id: 'inventario', label: 'Inventário' }, { id: 'movsaldo', label: 'Movimentações' },
    ] },
    { cat: 'Serviços', abas: [{ id: 'tecnicos', label: 'Performance Técnicos' }] },
    { cat: 'Clientes', abas: [
      { id: 'inativos', label: 'Inativos' }, { id: 'aniversarios', label: 'Aniversariantes' },
      { id: 'contatos', label: 'Contatos' },
    ] },
  ]

  const Card = ({ label, valor, cor }: { label: string; valor: string; cor: string }) => (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  )
  const badgeABC = (c: string) => c === 'A' ? 'bg-green-100 text-green-700' : c === 'B' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconChart className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
        <Dica texto="Análises por período. Cada aba exporta CSV. Financeiro, fluxo de caixa, DRE, inadimplência, vendas, lucro, produtos, curva ABC e estoque." />
      </div>

      {/* Abas por categoria (estilo SIGE) */}
      <div className="space-y-2">
        {categorias.map((c) => (
          <div key={c.cat} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{c.cat}</span>
            {c.abas.map((a) => (
              // prefetch={false}: são ~25 abas do mesmo relatório; pré-carregar todas
              // no load disparava ~25 requests RSC à toa. A troca de aba já tem skeleton
              // + barra de progresso, então continua fluida sem o prefetch em massa.
              <Link key={a.id} prefetch={false} href={`/painel/relatorios?aba=${a.id}&de=${dataInicio}&ate=${dataFim}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${aba === a.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>
                {a.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Período */}
      <form method="GET" className="flex flex-wrap gap-3 items-end">
        <input type="hidden" name="aba" value={aba} />
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">De</label>
          <input name="de" type="date" defaultValue={dataInicio} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Até</label>
          <input name="ate" type="date" defaultValue={dataFim} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button type="submit" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Filtrar</button>
      </form>

      {/* ---------------- Financeiro ---------------- */}
      {aba === 'financeiro' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="A Receber" valor={fmt(totalReceber)} cor="text-green-600" />
            <Card label="A Pagar" valor={fmt(totalPagar)} cor="text-red-500" />
            <Card label="Saldo" valor={fmt(totalReceber - totalPagar)} cor={totalReceber - totalPagar >= 0 ? 'text-blue-600' : 'text-red-500'} />
          </div>
          <div className="flex justify-end">
            <ExportCsv filename={`financeiro_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'descricao', label: 'Descrição' }, { key: 'pessoa_nome', label: 'Pessoa' }, { key: 'data_vencimento', label: 'Vencimento' }, { key: 'valor', label: 'Valor', money: true }, { key: 'tipo', label: 'Tipo' }, { key: 'status', label: 'Status' }]}
              rows={asRows(lancamentos)} />
          </div>
          <Tabela vazio={lancamentos.length === 0} vazioMsg="Nenhum lançamento no período."
            head={['Descrição', 'Pessoa', 'Vencimento', 'Valor', 'Tipo', 'Status']} alinhas={['l', 'l', 'l', 'r', 'c', 'c']}>
            {lancamentos.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-800">{l.descricao || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.pessoa_nome || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{l.data_vencimento ? formatDate(l.data_vencimento) : '—'}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-800">{fmt(l.valor)}</td>
                <td className="px-4 py-3 text-center"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.tipo === 'receber' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{l.tipo}</span></td>
                <td className="px-4 py-3 text-center"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'pago' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>{l.status}</span></td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Fluxo de Caixa ---------------- */}
      {aba === 'fluxo' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="Entradas (vendas)" valor={fmt(fluxoEntradas)} cor="text-green-600" />
            <Card label="Saídas (contas pagas)" valor={fmt(fluxoSaidas)} cor="text-red-500" />
            <Card label="Saldo do período" valor={fmt(fluxoEntradas - fluxoSaidas)} cor={fluxoEntradas - fluxoSaidas >= 0 ? 'text-blue-600' : 'text-red-500'} />
          </div>
          <p className="text-[11px] text-gray-400">Entradas = vendas concluídas no dia · Saídas = contas a pagar quitadas no dia (data de pagamento).</p>
          <FluxoChart dados={fluxo} />
          <div className="flex justify-end">
            <ExportCsv filename={`fluxo_caixa_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'dia', label: 'Dia' }, { key: 'entrada', label: 'Entradas', money: true }, { key: 'saida', label: 'Saídas', money: true }, { key: 'saldo', label: 'Saldo', money: true }, { key: 'acumulado', label: 'Acumulado', money: true }]}
              rows={asRows(fluxo)} />
          </div>
          <Tabela vazio={fluxo.length === 0} vazioMsg="Sem movimento no período."
            head={['Dia', 'Entradas', 'Saídas', 'Saldo', 'Acumulado']} alinhas={['l', 'r', 'r', 'r', 'r']}>
            {fluxo.map((f) => (
              <tr key={f.dia} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(f.dia)}</td>
                <td className="px-4 py-3 text-sm text-right text-green-600">{fmt(f.entrada)}</td>
                <td className="px-4 py-3 text-sm text-right text-red-500">{fmt(f.saida)}</td>
                <td className={`px-4 py-3 text-sm text-right font-medium ${f.saldo >= 0 ? 'text-gray-800' : 'text-red-500'}`}>{fmt(f.saldo)}</td>
                <td className={`px-4 py-3 text-sm text-right font-semibold ${f.acumulado >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{fmt(f.acumulado)}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- DRE ---------------- */}
      {aba === 'dre' && (
        <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-1 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <LinhaDRE label="Receita de vendas" valor={dreReceita} cor="text-gray-800" />
            <LinhaDRE label="(−) Custo dos produtos (CMV)" valor={-dreCmv} cor="text-orange-500" />
            <div className="my-1 border-t border-gray-100" />
            <LinhaDRE label="(=) Lucro bruto" valor={dreLucroBruto} cor={dreLucroBruto >= 0 ? 'text-green-600' : 'text-red-500'} bold />
            <LinhaDRE label="(−) Despesas (contas a pagar)" valor={-dreDespesas} cor="text-red-500" />
            <div className="my-1 border-t-2 border-gray-200" />
            <LinhaDRE label="(=) Resultado do período" valor={dreResultado} cor={dreResultado >= 0 ? 'text-blue-600' : 'text-red-600'} bold big />
            <p className="pt-3 text-[11px] text-gray-400">Receita e CMV pela data da venda; despesas pelo vencimento no período. CMV usa o custo atual do produto.</p>
          </div>
          <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {dreReceita > 0 ? (
              <Donut
                centro={`${((dreResultado / dreReceita) * 100).toFixed(0)}%`}
                centroLabel="resultado"
                slices={[
                  { label: 'Custo (CMV)', valor: dreCmv, cor: '#F47920' },
                  { label: 'Despesas', valor: dreDespesas, cor: '#ef4444' },
                  { label: dreResultado >= 0 ? 'Resultado' : 'Prejuízo', valor: dreResultado, cor: dreResultado >= 0 ? '#1B6CA8' : '#dc2626' },
                ]}
              />
            ) : <p className="text-sm text-gray-400">Sem receita no período.</p>}
          </div>
        </div>

        {despesasPorCategoria.length > 0 && (
          <div>
            <h3 className="mb-2 font-semibold text-gray-800">Despesas por categoria</h3>
            <Tabela vazio={false} head={['Categoria', 'Valor', '%']} alinhas={['l', 'r', 'r']}>
              {despesasPorCategoria.map((d, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 shrink-0"><Barra frac={dreDespesas > 0 ? d.valor / dreDespesas : 0} cor="#ef4444" /></div>
                      <span className="text-sm font-medium text-gray-800">{d.categoria}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-500">{fmt(d.valor)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">{dreDespesas > 0 ? ((d.valor / dreDespesas) * 100).toFixed(0) : 0}%</td>
                </tr>
              ))}
            </Tabela>
          </div>
        )}
        </div>
      )}

      {/* ---------------- Inadimplência ---------------- */}
      {aba === 'inadimplencia' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="Total em atraso" valor={fmt(totalInad)} cor="text-red-600" />
            <Card label="Clientes devendo" valor={String(inadimplentes.length)} cor="text-gray-800" />
            <Card label="Títulos vencidos" valor={String(inadimplentes.reduce((s, i) => s + i.titulos, 0))} cor="text-gray-800" />
          </div>
          <p className="text-[11px] text-gray-400">Fiado (a receber) com vencimento passado e ainda não quitado. Independe do filtro de período.</p>
          <div className="flex justify-end">
            <ExportCsv filename={`inadimplentes_${dataFim}.csv`}
              cols={[{ key: 'pessoa', label: 'Cliente' }, { key: 'telefone', label: 'Telefone' }, { key: 'titulos', label: 'Títulos' }, { key: 'diasAtraso', label: 'Dias atraso' }, { key: 'emAberto', label: 'Em aberto', money: true }]}
              rows={asRows(inadimplentes)} />
          </div>
          <Tabela vazio={inadimplentes.length === 0} vazioMsg="Ninguém em atraso. 🎉"
            head={['Cliente', 'Contato', 'Títulos', 'Atraso (dias)', 'Em aberto']} alinhas={['l', 'l', 'r', 'r', 'r']}>
            {inadimplentes.map((c, i) => {
              const zap = (c.telefone || '').replace(/\D/g, '')
              const zapLink = zap.length >= 10 ? `https://wa.me/55${zap}?text=${encodeURIComponent(`Oi ${c.pessoa}, tudo bem? Passando pra lembrar do seu fiado na TecnoCell: ${fmt(c.emAberto)} em aberto. Quando puder acertar, agradeço! 😊`)}` : null
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.pessoa}</td>
                  <td className="px-4 py-3 text-sm">
                    {c.telefone ? (
                      zapLink
                        ? <a href={zapLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 transition">💬 {c.telefone}</a>
                        : <span className="text-gray-600">{c.telefone}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{c.titulos}</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${c.diasAtraso > 30 ? 'text-red-600' : 'text-orange-500'}`}>{c.diasAtraso}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{fmt(c.emAberto)}</td>
                </tr>
              )
            })}
          </Tabela>
        </div>
      )}

      {/* ---------------- Vendas ---------------- */}
      {aba === 'vendas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="Total Vendido" valor={fmt(totalVendasLista)} cor="text-blue-600" />
            <Card label="Nº de Vendas" valor={String(vendasLista.length)} cor="text-gray-800" />
            <Card label="Ticket Médio" valor={vendasLista.length > 0 ? fmt(totalVendasLista / vendasLista.length) : 'R$ 0,00'} cor="text-gray-800" />
          </div>
          <div className="flex justify-end">
            <ExportCsv filename={`vendas_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'created_at', label: 'Data' }, { key: 'total', label: 'Total', money: true }, { key: 'desconto', label: 'Desconto', money: true }, { key: 'status', label: 'Status' }]}
              rows={asRows(vendasLista)} />
          </div>
          <Tabela vazio={vendasLista.length === 0} vazioMsg="Nenhuma venda no período."
            head={['Data', 'Total', 'Desconto', 'Status']} alinhas={['l', 'r', 'r', 'c']}>
            {vendasLista.map((v) => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">{new Date(v.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(v.total)}</td>
                <td className="px-4 py-3 text-sm text-right text-red-500">{fmt(v.desconto ?? 0)}</td>
                <td className="px-4 py-3 text-center"><span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">{v.status}</span></td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Lucro ---------------- */}
      {aba === 'lucro' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card label="Vendido" valor={fmt(totalVendidoItens)} cor="text-blue-600" />
            <Card label="Custo" valor={fmt(totalCustoItens)} cor="text-orange-500" />
            <Card label="Lucro" valor={fmt(lucroTotal)} cor={lucroTotal >= 0 ? 'text-green-600' : 'text-red-500'} />
            <Card label="Margem" valor={`${margemTotal.toFixed(1)}%`} cor="text-gray-800" />
          </div>
          <p className="text-[11px] text-gray-400">Custo = preço de custo atual do produto × quantidade vendida.</p>
          <div className="flex justify-end">
            <ExportCsv filename={`lucro_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Produto' }, { key: 'qtd', label: 'Qtd' }, { key: 'vendido', label: 'Vendido', money: true }, { key: 'custo', label: 'Custo', money: true }, { key: 'lucro', label: 'Lucro', money: true }, { key: 'margem', label: 'Margem %' }]}
              rows={asRows(rankLucro)} />
          </div>
          <Tabela vazio={rankLucro.length === 0} vazioMsg="Sem vendas concluídas no período."
            head={['Produto', 'Qtd', 'Vendido', 'Custo', 'Lucro', 'Margem']} alinhas={['l', 'r', 'r', 'r', 'r', 'r']}>
            {rankLucro.map((p, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{p.qtd}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(p.vendido)}</td>
                <td className="px-4 py-3 text-sm text-right text-orange-500">{fmt(p.custo)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 shrink-0"><Barra frac={Math.max(0, p.lucro) / maxLuc} cor="#22c55e" /></div>
                    <span className={`text-sm text-right font-semibold ${p.lucro >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(p.lucro)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{p.margem.toFixed(1)}%</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Produtos ---------------- */}
      {aba === 'produtos' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <RankingBox titulo="Mais vendidos (quantidade)" filename={`mais_vendidos_${dataInicio}_${dataFim}.csv`}
            cols={[{ key: 'nome', label: 'Produto' }, { key: 'qtd', label: 'Qtd' }, { key: 'vendido', label: 'Valor', money: true }]}
            rows={asRows(rankQtd)} head={['Produto', 'Qtd', 'Valor']}>
            {rankQtd.slice(0, 20).map((p, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 shrink-0"><Barra frac={p.qtd / maxQtd} /></div>
                    <span className="text-sm font-semibold text-blue-600">{p.qtd}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(p.vendido)}</td>
              </tr>
            ))}
          </RankingBox>
          <RankingBox titulo="Top clientes (faturamento)" filename={`top_clientes_${dataInicio}_${dataFim}.csv`}
            cols={[{ key: 'nome', label: 'Cliente' }, { key: 'qtd', label: 'Compras' }, { key: 'total', label: 'Total', money: true }]}
            rows={asRows(rankClientes)} head={['Cliente', 'Compras', 'Total']}>
            {rankClientes.slice(0, 20).map((c, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.nome}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{c.qtd}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-20 shrink-0"><Barra frac={c.total / maxCli} cor="#F47920" /></div>
                    <span className="text-sm font-semibold text-gray-800">{fmt(c.total)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </RankingBox>
        </div>
      )}

      {/* ---------------- Curva ABC ---------------- */}
      {aba === 'abc' && (
        <div className="space-y-6">
          <p className="text-[11px] text-gray-400">Classe A = os que somam até 80% do faturamento · B = até 95% · C = o resto. É onde focar.</p>
          {abcProdutos.length > 0 && <ParetoChart dados={abcProdutos} />}
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">ABC de Produtos <span className="text-xs font-normal text-gray-400">(A:{contaClasse(abcProdutos, 'A')} B:{contaClasse(abcProdutos, 'B')} C:{contaClasse(abcProdutos, 'C')})</span></h3>
                <ExportCsv filename={`abc_produtos_${dataInicio}_${dataFim}.csv`}
                  cols={[{ key: 'classe', label: 'Classe' }, { key: 'nome', label: 'Produto' }, { key: 'qtd', label: 'Qtd' }, { key: 'valor', label: 'Faturamento', money: true }, { key: 'pctAcum', label: '% Acum' }]}
                  rows={asRows(abcProdutos)} />
              </div>
              <Tabela vazio={abcProdutos.length === 0} vazioMsg="Sem vendas no período." head={['', 'Produto', 'Faturamento', '% Acum']} alinhas={['c', 'l', 'r', 'r']}>
                {abcProdutos.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-center"><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${badgeABC(p.classe)}`}>{p.classe}</span></td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(p.valor)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{p.pctAcum.toFixed(1)}%</td>
                  </tr>
                ))}
              </Tabela>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">ABC de Clientes <span className="text-xs font-normal text-gray-400">(A:{contaClasse(abcClientes, 'A')} B:{contaClasse(abcClientes, 'B')} C:{contaClasse(abcClientes, 'C')})</span></h3>
                <ExportCsv filename={`abc_clientes_${dataInicio}_${dataFim}.csv`}
                  cols={[{ key: 'classe', label: 'Classe' }, { key: 'nome', label: 'Cliente' }, { key: 'qtd', label: 'Compras' }, { key: 'valor', label: 'Faturamento', money: true }, { key: 'pctAcum', label: '% Acum' }]}
                  rows={asRows(abcClientes)} />
              </div>
              <Tabela vazio={abcClientes.length === 0} vazioMsg="Sem vendas no período." head={['', 'Cliente', 'Faturamento', '% Acum']} alinhas={['c', 'l', 'r', 'r']}>
                {abcClientes.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-center"><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${badgeABC(c.classe)}`}>{c.classe}</span></td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.nome}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(c.valor)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{c.pctAcum.toFixed(1)}%</td>
                  </tr>
                ))}
              </Tabela>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Estoque ---------------- */}
      {aba === 'estoque' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card label="Investido (a custo)" valor={fmt(valorCusto)} cor="text-orange-600" />
            <Card label="Potencial (a venda)" valor={fmt(valorVenda)} cor="text-green-600" />
            <Card label="Críticos" valor={String(criticos.length)} cor={criticos.length > 0 ? 'text-red-600' : 'text-gray-800'} />
            <Card label="Repor (giro)" valor={String(previsao.length)} cor="text-blue-600" />
          </div>

          {criticos.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold text-gray-800">⚠️ Estoque crítico (no/abaixo do mínimo)</h3>
              <Tabela vazio={false} head={['Produto', 'Em estoque', 'Mínimo']} alinhas={['l', 'r', 'r']}>
                {criticos.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.nome}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{c.qtd}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{c.minimo}</td>
                  </tr>
                ))}
              </Tabela>
            </div>
          )}

          {previsao.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">🔄 Previsão de compra (giro dos últimos 30 dias)</h3>
                <ExportCsv filename={`previsao_compra_${dataFim}.csv`}
                  cols={[{ key: 'nome', label: 'Produto' }, { key: 'estoque', label: 'Estoque' }, { key: 'vendido30', label: 'Vendido 30d' }, { key: 'sugestao', label: 'Sugestão compra' }]}
                  rows={asRows(previsao)} />
              </div>
              <Tabela vazio={false} head={['Produto', 'Estoque', 'Vendido 30d', 'Sugestão']} alinhas={['l', 'r', 'r', 'r']}>
                {previsao.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{p.estoque}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{p.vendido30}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">+{p.sugestao}</td>
                  </tr>
                ))}
              </Tabela>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Estoque atual</h3>
              <ExportCsvLazy aba="estoque" filename={`estoque_${dataFim}.csv`}
                cols={[{ key: 'nome', label: 'Produto' }, { key: 'deposito', label: 'Depósito' }, { key: 'quantidade', label: 'Qtd' }, { key: 'custo', label: 'Custo Unit', money: true }, { key: 'preco', label: 'Venda Unit', money: true }]} />
            </div>
            {estoque.length > AMOSTRA && <p className="mb-2 text-[11px] text-gray-400">Mostrando {AMOSTRA} de {estoque.length} — exporte o CSV pra lista completa.</p>}
            <Tabela vazio={estoque.length === 0} vazioMsg="Sem dados de estoque."
              head={['Produto', 'Depósito', 'Qtd', 'Total Custo', 'Total Venda']} alinhas={['l', 'l', 'r', 'r', 'r']}>
              {estoque.slice(0, AMOSTRA).map((e, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.deposito}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{e.quantidade}</td>
                  <td className="px-4 py-3 text-sm text-right text-orange-600">{fmt(e.quantidade * e.custo)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(e.quantidade * e.preco)}</td>
                </tr>
              ))}
            </Tabela>
          </div>
        </div>
      )}

      {/* ---------------- Formas de pagamento ---------------- */}
      {aba === 'formas' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              {totalFormas > 0 ? (
                <Donut centro={totalFormas >= 1000 ? `R$ ${(totalFormas / 1000).toFixed(1)}k` : fmt(totalFormas)} centroLabel="em vendas"
                  slices={rankFormas.slice(0, 6).map((f, i) => ({ label: f.nome, valor: f.total, cor: ['#1B6CA8', '#F47920', '#22c55e', '#eab308', '#a855f7', '#94a3b8'][i] }))} />
              ) : <p className="text-sm text-gray-400">Sem pagamentos no período.</p>}
            </div>
            <div className="flex-1">
              <div className="mb-2 flex justify-end">
                <ExportCsv filename={`formas_pagamento_${dataInicio}_${dataFim}.csv`}
                  cols={[{ key: 'nome', label: 'Forma' }, { key: 'qtd', label: 'Qtd' }, { key: 'total', label: 'Total', money: true }]} rows={asRows(rankFormas)} />
              </div>
              <Tabela vazio={rankFormas.length === 0} vazioMsg="Sem pagamentos no período." head={['Forma', 'Qtd', 'Total', '%']} alinhas={['l', 'r', 'r', 'r']}>
                {rankFormas.map((f, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{f.nome}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{f.qtd}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(f.total)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{totalFormas > 0 ? ((f.total / totalFormas) * 100).toFixed(0) : 0}%</td>
                  </tr>
                ))}
              </Tabela>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Por loja ---------------- */}
      {aba === 'porloja' && (
        <RankSimples titulo="Vendas por loja" filename={`vendas_por_loja_${dataInicio}_${dataFim}.csv`}
          rows={rankLojas} colLabel="Loja" />
      )}

      {/* ---------------- Por vendedor ---------------- */}
      {aba === 'porvendedor' && (
        <RankSimples titulo="Vendas por vendedor" filename={`vendas_por_vendedor_${dataInicio}_${dataFim}.csv`}
          rows={rankVendedores} colLabel="Vendedor" />
      )}

      {/* ---------------- Periodicidade ---------------- */}
      {aba === 'periodicidade' && (
        <div className="space-y-4">
          <p className="text-[11px] text-gray-400">Em que dia da semana a loja mais vende — útil pra escala e promoções.</p>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-2">
            {periodicidade.map((p) => (
              <div key={p.dia} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm text-gray-600">{p.dia}</span>
                <div className="flex-1"><Barra frac={p.total / maxPeriodo} /></div>
                <span className="w-28 shrink-0 text-right text-sm font-semibold text-gray-800">{fmt(p.total)}</span>
                <span className="w-16 shrink-0 text-right text-xs text-gray-400">{p.qtd} vd</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- Clientes inativos ---------------- */}
      {aba === 'inativos' && (
        <div className="space-y-4">
          <p className="text-[11px] text-gray-400">Clientes que já compraram mas não voltam há 60+ dias. Ligue e traga de volta.</p>
          <div className="flex justify-end">
            <ExportCsv filename={`clientes_inativos_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Cliente' }, { key: 'dias', label: 'Dias sem comprar' }, { key: 'ultima', label: 'Última compra' }]} rows={asRows(inativos)} />
          </div>
          <Tabela vazio={inativos.length === 0} vazioMsg="Nenhum cliente inativo. 👏" head={['Cliente', 'Última compra', 'Dias sem comprar']} alinhas={['l', 'l', 'r']}>
            {inativos.map((c, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.ultima)}</td>
                <td className={`px-4 py-3 text-sm text-right font-medium ${c.dias > 120 ? 'text-red-600' : 'text-orange-500'}`}>{c.dias}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Aniversariantes ---------------- */}
      {aba === 'aniversarios' && (
        <div className="space-y-4">
          <p className="text-[11px] text-gray-400">Aniversariantes deste mês — manda um desconto no WhatsApp e vende mais.</p>
          <div className="flex justify-end">
            <ExportCsv filename={`aniversariantes.csv`}
              cols={[{ key: 'dia', label: 'Dia' }, { key: 'nome', label: 'Cliente' }, { key: 'telefone', label: 'Telefone' }]} rows={asRows(aniversariantes)} />
          </div>
          <Tabela vazio={aniversariantes.length === 0} vazioMsg="Ninguém faz aniversário este mês (ou faltam datas nos cadastros)." head={['Dia', 'Cliente', 'Telefone']} alinhas={['c', 'l', 'l']}>
            {aniversariantes.map((a, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-center"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-pink-100 text-xs font-bold text-pink-700">{a.dia}</span></td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">🎂 {a.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{a.telefone || '—'}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Comissões ---------------- */}
      {aba === 'comissoes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="Comissão a pagar" valor={fmt(totalComissao)} cor="text-green-600" />
            <Card label="% aplicado" valor={`${comissaoPctG}%`} cor="text-gray-800" />
            <Card label="Vendedores" valor={String(comissoes.length)} cor="text-gray-800" />
          </div>
          {comissaoPctG === 0 && <p className="text-[11px] text-orange-500">Defina a % de comissão em Configurações pra calcular.</p>}
          <div className="flex justify-end">
            <ExportCsv filename={`comissoes_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Vendedor' }, { key: 'vendido', label: 'Vendido', money: true }, { key: 'comissao', label: 'Comissão', money: true }]} rows={asRows(comissoes)} />
          </div>
          <Tabela vazio={comissoes.length === 0} vazioMsg="Sem vendas no período." head={['Vendedor', 'Vendido', 'Comissão']} alinhas={['l', 'r', 'r']}>
            {comissoes.map((c, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.nome}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(c.vendido)}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">{fmt(c.comissao)}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Previsão de Caixa ---------------- */}
      {aba === 'previsaocaixa' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="A receber (futuro)" valor={fmt(prevReceber)} cor="text-green-600" />
            <Card label="A pagar (futuro)" valor={fmt(prevPagar)} cor="text-red-500" />
            <Card label="Saldo projetado" valor={fmt(prevReceber - prevPagar)} cor={prevReceber - prevPagar >= 0 ? 'text-blue-600' : 'text-red-500'} />
          </div>
          <p className="text-[11px] text-gray-400">Lançamentos pendentes com vencimento a partir de hoje. Independe do filtro de período.</p>
          <Tabela vazio={prevCaixa.length === 0} vazioMsg="Nada pendente pra frente." head={['Vencimento', 'Descrição', 'Valor', 'Saldo projetado']} alinhas={['l', 'l', 'r', 'r']}>
            {prevCaixa.map((l, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(l.data)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{l.descricao}</td>
                <td className={`px-4 py-3 text-sm text-right font-medium ${l.valor >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(l.valor)}</td>
                <td className={`px-4 py-3 text-sm text-right font-semibold ${l.saldo >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{fmt(l.saldo)}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Comparativo ---------------- */}
      {aba === 'comparativo' && (
        <div className="space-y-4">
          <p className="text-[11px] text-gray-400">Período selecionado × período anterior de mesmo tamanho.</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Indicador</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Anterior</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Atual</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Variação</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  { l: 'Receita', a: compAtual.receita, b: compAnt.receita, money: true, inv: false },
                  { l: 'Despesas', a: compAtual.despesas, b: compAnt.despesas, money: true, inv: true },
                  { l: 'Resultado', a: compAtual.receita - compAtual.despesas, b: compAnt.receita - compAnt.despesas, money: true, inv: false },
                  { l: 'Nº de vendas', a: compAtual.nvendas, b: compAnt.nvendas, money: false, inv: false },
                ].map((r, i) => {
                  const v = variacao(r.a, r.b)
                  // pra despesas, subir é ruim (vermelho); pro resto, subir é bom (verde)
                  const bom = r.inv ? v <= 0 : v >= 0
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.l}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500">{r.money ? fmt(r.b) : r.b}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{r.money ? fmt(r.a) : r.a}</td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${bom ? 'text-green-600' : 'text-red-500'}`}>{v >= 0 ? '▲' : '▼'} {Math.abs(v).toFixed(0)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- Itens por vendedor ---------------- */}
      {aba === 'itensvendedor' && (
        <div className="space-y-6">
          {itensVendedor.length === 0 && <p className="text-sm text-gray-400">Sem vendas no período.</p>}
          {itensVendedor.map((v) => (
            <div key={v.vendedor}>
              <h3 className="mb-2 font-semibold text-gray-800">{v.vendedor}</h3>
              <Tabela vazio={false} head={['Produto', 'Qtd', 'Valor']} alinhas={['l', 'r', 'r']}>
                {v.itens.map((it, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{it.nome}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{it.qtd}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(it.valor)}</td>
                  </tr>
                ))}
              </Tabela>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- Precificação ---------------- */}
      {aba === 'precificacao' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ExportCsvLazy aba="precificacao" filename={`precificacao.csv`}
              cols={[{ key: 'nome', label: 'Produto' }, { key: 'custo', label: 'Custo', money: true }, { key: 'preco', label: 'Preço', money: true }, { key: 'minimo', label: 'Mínimo', money: true }, { key: 'margem', label: 'Margem %' }]} />
          </div>
          {precos.length > AMOSTRA && <p className="text-[11px] text-gray-400">Mostrando {AMOSTRA} de {precos.length} — exporte o CSV pra lista completa.</p>}
          <Tabela vazio={precos.length === 0} vazioMsg="Sem produtos." head={['Produto', 'Custo', 'Preço', 'Mínimo', 'Margem']} alinhas={['l', 'r', 'r', 'r', 'r']}>
            {precos.slice(0, AMOSTRA).map((p, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                <td className="px-4 py-3 text-sm text-right text-orange-500">{fmt(p.custo)}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(p.preco)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-400">{p.minimo > 0 ? fmt(p.minimo) : '—'}</td>
                <td className={`px-4 py-3 text-sm text-right ${p.margem < 0 ? 'text-red-500' : 'text-gray-600'}`}>{p.margem.toFixed(0)}%</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Pedidos ---------------- */}
      {aba === 'pedidos' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.entries(pedidosResumo).map(([st, n]) => (
              <span key={st} className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600">{st}: <b className="text-gray-900">{n}</b></span>
            ))}
          </div>
          <div className="flex justify-end">
            <ExportCsv filename={`pedidos_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'numero', label: 'Nº' }, { key: 'tipo', label: 'Tipo' }, { key: 'cliente', label: 'Cliente' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'Total', money: true }]} rows={asRows(pedidosLista)} />
          </div>
          <Tabela vazio={pedidosLista.length === 0} vazioMsg="Nenhum pedido no período." head={['Nº', 'Tipo', 'Cliente', 'Status', 'Total']} alinhas={['l', 'l', 'l', 'c', 'r']}>
            {pedidosLista.map((p, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.numero ? `#${p.numero}` : '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.tipo}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{p.cliente}</td>
                <td className="px-4 py-3 text-center"><span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{p.status}</span></td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(p.total)}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Entrada de Produtos ---------------- */}
      {aba === 'entradas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card label="Total entrado (custo)" valor={fmt(totalEntradas)} cor="text-orange-600" />
            <Card label="Produtos distintos" valor={String(entradas.length)} cor="text-gray-800" />
          </div>
          <div className="flex justify-end">
            <ExportCsv filename={`entradas_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Produto' }, { key: 'qtd', label: 'Qtd' }, { key: 'valor', label: 'Custo total', money: true }]} rows={asRows(entradas)} />
          </div>
          <Tabela vazio={entradas.length === 0} vazioMsg="Nenhuma nota de entrada recebida no período." head={['Produto', 'Qtd', 'Custo total']} alinhas={['l', 'r', 'r']}>
            {entradas.map((e, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.nome}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600">{e.qtd}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(e.valor)}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Produtos por Fornecedor ---------------- */}
      {aba === 'porfornecedor' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ExportCsv filename={`produtos_por_fornecedor.csv`}
              cols={[{ key: 'fornecedor', label: 'Fornecedor' }, { key: 'produtos', label: 'Produtos' }]} rows={asRows(porFornecedor)} />
          </div>
          <Tabela vazio={porFornecedor.length === 0} vazioMsg="Sem produtos." head={['Fornecedor', 'Nº de produtos']} alinhas={['l', 'r']}>
            {porFornecedor.map((f, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{f.fornecedor}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{f.produtos}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Inventário (folha de contagem) ---------------- */}
      {aba === 'inventario' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400">Folha pra contagem física. Exporte, conte, compare com o sistema.</p>
            <ExportCsvLazy aba="inventario" filename={`inventario_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Produto' }, { key: 'deposito', label: 'Depósito' }, { key: 'sistema', label: 'Sistema' }, { key: 'contagem', label: 'Contagem' }, { key: 'custo', label: 'Custo Unit', money: true }]} />
          </div>
          {inventario.length > AMOSTRA && <p className="text-[11px] text-gray-400">Mostrando {AMOSTRA} de {inventario.length} — exporte o CSV pra folha completa.</p>}
          <Tabela vazio={inventario.length === 0} vazioMsg="Sem estoque." head={['Produto', 'Depósito', 'Sistema', 'Contagem']} alinhas={['l', 'l', 'r', 'r']}>
            {inventario.slice(0, AMOSTRA).map((e, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{e.deposito}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{e.sistema}</td>
                <td className="px-4 py-3 text-right text-gray-300">____</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Movimentações x Saldo ---------------- */}
      {aba === 'movsaldo' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ExportCsv filename={`movimentacoes_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Produto' }, { key: 'entradas', label: 'Entradas' }, { key: 'saidas', label: 'Saídas' }, { key: 'saldo', label: 'Saldo atual' }]} rows={asRows(movSaldo)} />
          </div>
          <Tabela vazio={movSaldo.length === 0} vazioMsg="Sem movimentações no período." head={['Produto', 'Entradas', 'Saídas', 'Saldo atual']} alinhas={['l', 'r', 'r', 'r']}>
            {movSaldo.map((m, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{m.nome}</td>
                <td className="px-4 py-3 text-sm text-right text-green-600">+{m.entradas}</td>
                <td className="px-4 py-3 text-sm text-right text-red-500">−{m.saidas}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{m.saldo}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Performance Técnicos ---------------- */}
      {aba === 'tecnicos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ExportCsv filename={`performance_tecnicos_${dataInicio}_${dataFim}.csv`}
              cols={[{ key: 'nome', label: 'Técnico' }, { key: 'os', label: 'OS' }, { key: 'concluidas', label: 'Concluídas' }, { key: 'total', label: 'Faturado', money: true }]} rows={asRows(tecnicos)} />
          </div>
          <Tabela vazio={tecnicos.length === 0} vazioMsg="Nenhuma OS no período." head={['Técnico', 'OS', 'Concluídas', 'Faturado']} alinhas={['l', 'r', 'r', 'r']}>
            {tecnicos.map((t, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{t.nome}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{t.os}</td>
                <td className="px-4 py-3 text-sm text-right text-green-600">{t.concluidas}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(t.total)}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      {/* ---------------- Contatos ---------------- */}
      {aba === 'contatos' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ExportCsvLazy aba="contatos" filename={`contatos.csv`}
              cols={[{ key: 'nome', label: 'Nome' }, { key: 'telefone', label: 'Telefone' }, { key: 'cidade', label: 'Cidade' }, { key: 'tipo', label: 'Tipo' }]} />
          </div>
          {contatos.length > AMOSTRA && <p className="text-[11px] text-gray-400">Mostrando {AMOSTRA} de {contatos.length} — exporte o CSV pra lista completa.</p>}
          <Tabela vazio={contatos.length === 0} vazioMsg="Sem contatos com telefone." head={['Nome', 'Telefone', 'Cidade', 'Tipo']} alinhas={['l', 'l', 'l', 'c']}>
            {contatos.slice(0, AMOSTRA).map((c, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{c.telefone}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.cidade}</td>
                <td className="px-4 py-3 text-center text-xs text-gray-400">{c.tipo}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}
    </div>
  )
}

// Ranking simples: uma dimensão × total + barra (por loja, por vendedor)
function RankSimples({ titulo, filename, rows, colLabel }: { titulo: string; filename: string; rows: { nome: string; total: number; qtd: number }[]; colLabel: string }) {
  const max = Math.max(...rows.map((r) => r.total), 1)
  const totalGeral = rows.reduce((s, r) => s + r.total, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Total</p><p className="text-xl font-bold text-blue-600 tabular-nums">{totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">{colLabel}s</p><p className="text-xl font-bold text-gray-800 tabular-nums">{rows.length}</p></div>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{titulo}</h3>
        <ExportCsv filename={filename} cols={[{ key: 'nome', label: colLabel }, { key: 'qtd', label: 'Vendas' }, { key: 'total', label: 'Total', money: true }]} rows={rows as unknown as Record<string, unknown>[]} />
      </div>
      <Tabela vazio={rows.length === 0} vazioMsg="Sem vendas no período." head={[colLabel, 'Vendas', 'Total']} alinhas={['l', 'r', 'r']}>
        {rows.map((r, i) => (
          <tr key={i} className="hover:bg-gray-50">
            <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.nome}</td>
            <td className="px-4 py-3 text-sm text-right text-gray-600">{r.qtd}</td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-end gap-2">
                <div className="w-24 shrink-0"><Barra frac={r.total / max} /></div>
                <span className="text-sm font-semibold text-gray-800">{r.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </div>
            </td>
          </tr>
        ))}
      </Tabela>
    </div>
  )
}

// ---- helpers de UI ----
function Tabela({ head, alinhas, children, vazio, vazioMsg }: { head: string[]; alinhas: ('l' | 'r' | 'c')[]; children: React.ReactNode; vazio: boolean; vazioMsg?: string }) {
  const al = (a: string) => a === 'r' ? 'text-right' : a === 'c' ? 'text-center' : 'text-left'
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50"><tr>
          {head.map((h, i) => <th key={i} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase ${al(alinhas[i])}`}>{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {vazio ? <tr><td colSpan={head.length} className="px-4 py-10 text-center text-sm text-gray-400">{vazioMsg}</td></tr> : children}
        </tbody>
      </table>
    </div>
  )
}

function RankingBox({ titulo, filename, cols, rows, head, children }: { titulo: string; filename: string; cols: { key: string; label: string; money?: boolean }[]; rows: Record<string, unknown>[]; head: string[]; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{titulo}</h3>
        <ExportCsv filename={filename} cols={cols} rows={rows} />
      </div>
      <Tabela vazio={rows.length === 0} vazioMsg="Sem vendas no período." head={head} alinhas={head.map((_, i) => (i === 0 ? 'l' : 'r'))}>
        {children}
      </Tabela>
    </div>
  )
}

function LinhaDRE({ label, valor, cor, bold, big }: { label: string; valor: number; cor: string; bold?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`${bold ? 'font-semibold' : ''} ${big ? 'text-base' : 'text-sm'} text-gray-700`}>{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${big ? 'text-xl' : 'text-sm'} ${cor}`}>{valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
    </div>
  )
}
