import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { formatDate } from '@/lib/utils'
import { ExportCsv } from './ExportCsv'
import { FluxoChart, ParetoChart, Donut, Barra } from './Charts'

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

  const hoje = new Date().toISOString().split('T')[0]
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dataInicio = de ?? inicioMes
  const dataFim = ate ?? hoje
  const periodo = { inicio: dataInicio + 'T00:00:00', fim: dataFim + 'T23:59:59' }

  const precisaItens = ['lucro', 'produtos', 'abc', 'dre'].includes(aba)
  const precisaClientes = ['produtos', 'abc'].includes(aba)

  // ---------- Financeiro (lançamentos por vencimento) ----------
  let lancamentos: { tipo: string; status: string; valor: number; data_vencimento: string; descricao: string; pessoa_nome: string }[] = []
  if (aba === 'financeiro') {
    const { data } = await supabase.from('lancamentos')
      .select('tipo, status, valor, data_vencimento, descricao, pessoa_nome')
      .gte('data_vencimento', dataInicio).lte('data_vencimento', dataFim + 'T23:59:59')
      .order('data_vencimento')
    lancamentos = data ?? []
  }
  const totalReceber = lancamentos.filter((l) => l.tipo === 'receber').reduce((s, l) => s + l.valor, 0)
  const totalPagar = lancamentos.filter((l) => l.tipo === 'pagar').reduce((s, l) => s + l.valor, 0)

  // ---------- Vendas (lista) ----------
  let vendasLista: { id: string; total: number; desconto: number; created_at: string; status: string }[] = []
  if (aba === 'vendas') {
    const { data } = await supabase.from('vendas')
      .select('id, total, desconto, created_at, status')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim)
      .order('created_at', { ascending: false })
    vendasLista = data ?? []
  }
  const totalVendasLista = vendasLista.reduce((s, v) => s + v.total, 0)

  // ---------- Itens de venda do período (Lucro, Produtos, ABC, DRE) ----------
  type ProdAgg = { nome: string; qtd: number; vendido: number; custo: number }
  const porProduto: Record<string, ProdAgg> = {}
  let totalVendidoItens = 0, totalCustoItens = 0
  if (precisaItens) {
    const { data } = await supabase.from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produto_id, produtos(nome, preco_custo), vendas!inner(created_at, status, pessoa_id)')
      .eq('vendas.status', 'concluida')
      .gte('vendas.created_at', periodo.inicio).lte('vendas.created_at', periodo.fim)
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
    const { data } = await supabase.from('vendas')
      .select('total, pessoa_id, pessoas(nome)').eq('status', 'concluida')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim)
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
  type Inad = { pessoa: string; emAberto: number; titulos: number; diasAtraso: number }
  let inadimplentes: Inad[] = []
  let totalInad = 0
  if (aba === 'inadimplencia') {
    const { data } = await supabase.from('lancamentos')
      .select('valor, valor_pago, data_vencimento, pessoa_nome')
      .eq('tipo', 'receber').eq('status', 'pendente')
      .lt('data_vencimento', hoje)
    const mapa: Record<string, Inad> = {}
    const agora = Date.now()
    for (const l of (data ?? []) as { valor: number; valor_pago: number | null; data_vencimento: string | null; pessoa_nome: string | null }[]) {
      const pessoa = l.pessoa_nome || 'Sem cliente'
      const aberto = (l.valor ?? 0) - (l.valor_pago ?? 0)
      if (aberto <= 0) continue
      const dias = l.data_vencimento ? Math.floor((agora - new Date(l.data_vencimento).getTime()) / 86400000) : 0
      if (!mapa[pessoa]) mapa[pessoa] = { pessoa, emAberto: 0, titulos: 0, diasAtraso: 0 }
      mapa[pessoa].emAberto += aberto
      mapa[pessoa].titulos++
      mapa[pessoa].diasAtraso = Math.max(mapa[pessoa].diasAtraso, dias)
    }
    inadimplentes = Object.values(mapa).sort((a, b) => b.emAberto - a.emAberto)
    totalInad = inadimplentes.reduce((s, i) => s + i.emAberto, 0)
  }

  // ---------- DRE (resultado do período) ----------
  let dreReceita = 0, dreDespesas = 0
  if (aba === 'dre') {
    const { data: vs } = await supabase.from('vendas').select('total').eq('status', 'concluida')
      .gte('created_at', periodo.inicio).lte('created_at', periodo.fim)
    dreReceita = (vs ?? []).reduce((s, v) => s + (v.total ?? 0), 0)
    const { data: ds } = await supabase.from('lancamentos').select('valor')
      .eq('tipo', 'pagar').gte('data_vencimento', dataInicio).lte('data_vencimento', dataFim + 'T23:59:59')
    dreDespesas = (ds ?? []).reduce((s, l) => s + (l.valor ?? 0), 0)
  }
  const dreCmv = totalCustoItens
  const dreLucroBruto = dreReceita - dreCmv
  const dreResultado = dreLucroBruto - dreDespesas

  // ---------- Fluxo de Caixa (por dia) ----------
  type DiaFluxo = { dia: string; entrada: number; saida: number; saldo: number; acumulado: number }
  let fluxo: DiaFluxo[] = []
  let fluxoEntradas = 0, fluxoSaidas = 0
  if (aba === 'fluxo') {
    const [{ data: vs }, { data: ps }] = await Promise.all([
      supabase.from('vendas').select('total, created_at').eq('status', 'concluida')
        .gte('created_at', periodo.inicio).lte('created_at', periodo.fim),
      supabase.from('lancamentos').select('valor, data_pagamento').eq('tipo', 'pagar').eq('status', 'pago')
        .gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim + 'T23:59:59'),
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
    const { data } = await supabase.from('estoque')
      .select('produto_id, quantidade, produtos(nome, preco, preco_custo, estoque_minimo, ativo), depositos(nome)')
      .gt('quantidade', 0).limit(1000)
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
    const { data: v30 } = await supabase.from('itens_venda')
      .select('quantidade, produto_id, vendas!inner(created_at, status)')
      .eq('vendas.status', 'concluida').gte('vendas.created_at', limite30)
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

  const abas = [
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'fluxo', label: 'Fluxo de Caixa' },
    { id: 'dre', label: 'DRE' },
    { id: 'inadimplencia', label: 'Inadimplência' },
    { id: 'vendas', label: 'Vendas' },
    { id: 'lucro', label: 'Lucro' },
    { id: 'produtos', label: 'Produtos' },
    { id: 'abc', label: 'Curva ABC' },
    { id: 'estoque', label: 'Estoque' },
  ]

  const Card = ({ label, valor, cor }: { label: string; valor: string; cor: string }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${cor}`}>{valor}</p>
    </div>
  )
  const badgeABC = (c: string) => c === 'A' ? 'bg-green-100 text-green-700' : c === 'B' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-gray-900">Relatórios</h2>
        <Dica texto="Análises por período. Cada aba exporta CSV. Financeiro, fluxo de caixa, DRE, inadimplência, vendas, lucro, produtos, curva ABC e estoque." />
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit">
        {abas.map((a) => (
          <Link key={a.id} href={`/painel/relatorios?aba=${a.id}&de=${dataInicio}&ate=${dataFim}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${aba === a.id ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
            {a.label}
          </Link>
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
                  { label: 'Resultado', valor: Math.max(0, dreResultado), cor: '#1B6CA8' },
                ]}
              />
            ) : <p className="text-sm text-gray-400">Sem receita no período.</p>}
          </div>
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
              cols={[{ key: 'pessoa', label: 'Cliente' }, { key: 'titulos', label: 'Títulos' }, { key: 'diasAtraso', label: 'Dias atraso' }, { key: 'emAberto', label: 'Em aberto', money: true }]}
              rows={asRows(inadimplentes)} />
          </div>
          <Tabela vazio={inadimplentes.length === 0} vazioMsg="Ninguém em atraso. 🎉"
            head={['Cliente', 'Títulos', 'Atraso (dias)', 'Em aberto']} alinhas={['l', 'r', 'r', 'r']}>
            {inadimplentes.map((c, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.pessoa}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{c.titulos}</td>
                <td className={`px-4 py-3 text-sm text-right font-medium ${c.diasAtraso > 30 ? 'text-red-600' : 'text-orange-500'}`}>{c.diasAtraso}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{fmt(c.emAberto)}</td>
              </tr>
            ))}
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
              <ExportCsv filename={`estoque_${dataFim}.csv`}
                cols={[{ key: 'nome', label: 'Produto' }, { key: 'deposito', label: 'Depósito' }, { key: 'quantidade', label: 'Qtd' }, { key: 'custo', label: 'Custo Unit', money: true }, { key: 'preco', label: 'Venda Unit', money: true }]}
                rows={asRows(estoque)} />
            </div>
            <Tabela vazio={estoque.length === 0} vazioMsg="Sem dados de estoque."
              head={['Produto', 'Depósito', 'Qtd', 'Total Custo', 'Total Venda']} alinhas={['l', 'l', 'r', 'r', 'r']}>
              {estoque.slice(0, 200).map((e, i) => (
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
