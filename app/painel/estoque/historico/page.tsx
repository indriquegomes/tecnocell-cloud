import { IconSwap } from '@/components/icons'
import { createServiceClient, fetchAllIn } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import Link from 'next/link'
import { ColunasToggler } from './ColunasToggler'
import { NovaMovimentacaoForm } from './NovaMovimentacaoForm'
import { Dica } from '@/components/Dica'

type Tipo = 'venda' | 'devolucao' | 'entrada' | 'saida' | 'ajuste' | 'perda' | 'troca'

const TIPO: Record<Tipo, { label: string; cls: string; sinal: string }> = {
  venda:     { label: 'Venda',     cls: 'text-red-700 bg-red-50 border-red-200',      sinal: '−' },
  devolucao: { label: 'Devolução', cls: 'text-green-700 bg-green-50 border-green-200', sinal: '+' },
  entrada:   { label: 'Entrada',   cls: 'text-green-700 bg-green-50 border-green-200', sinal: '+' },
  saida:     { label: 'Saída',     cls: 'text-red-700 bg-red-50 border-red-200',       sinal: '−' },
  ajuste:    { label: 'Ajuste',    cls: 'text-blue-700 bg-blue-50 border-blue-200',    sinal: '' },
  // Perda (quebra/sumiço/avaria): baixa igual à saída, mas separada pra somar no mês.
  perda:     { label: 'Perda',     cls: 'text-orange-700 bg-orange-50 border-orange-200', sinal: '−' },
  // Troca/Defeito/Avaria numa devolução: o item NÃO volta ao estoque vendável (vai
  // pro fornecedor). Sinal neutro pra não dobrar a saída (a venda já baixou). Isa 29/07.
  troca:     { label: 'Troca · Saída', cls: 'text-orange-700 bg-orange-50 border-orange-200', sinal: '' },
}

type Linha = {
  key: string
  data: string
  tipo: Tipo
  produtoId: string
  produto: string
  parte: string
  vendedor: string
  deposito: string
  qtd: number
  custo: number
  valorUnitario: number | null
  valorTotal: number | null
  saldo: string | null
  obs: string | null
}

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tipo?: string
    produto?: string
    cliente?: string
    vendedor?: string
    deposito?: string
    de?: string
    ate?: string
    ordem?: string
    dir?: string
    erro?: string
    aviso?: string
    n?: string
    ok?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  // Datas no fuso de São Paulo (UTC-3), independente do servidor Vercel (UTC)
  const agoraBr = new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' })
  const hoje = agoraBr.slice(0, 10)
  const anoMes = hoje.slice(0, 7)
  const inicioMes = `${anoMes}-01`
  const de = params.de ?? inicioMes
  const ate = params.ate ?? hoje
  const ini = de + 'T00:00:00-03:00'
  const fim = ate + 'T23:59:59-03:00'

  // 1. Fontes no período
  let qManuais = supabase.from('movimentacoes_estoque')
    .select('id, produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, created_at')
    .gte('created_at', ini).lte('created_at', fim).order('created_at', { ascending: false }).limit(500)
  if (params.deposito) qManuais = qManuais.eq('deposito_id', params.deposito)

  let qVendas = supabase.from('vendas')
    .select('id, numero, created_at, vendedor_nome, pessoa_id, deposito_id, status')
    .neq('status', 'aberta')
    .gte('created_at', ini).lte('created_at', fim).order('created_at', { ascending: false }).limit(500)
  if (params.deposito) qVendas = qVendas.eq('deposito_id', params.deposito)

  let qDevs = supabase.from('devolucoes')
    .select('id, created_at, pessoa_nome, vendedor_nome, deposito_id, motivo')
    .gte('created_at', ini).lte('created_at', fim).order('created_at', { ascending: false }).limit(500)
  if (params.deposito) qDevs = qDevs.eq('deposito_id', params.deposito)

  const dataHoje = hoje
  const horaAgora = agoraBr.slice(11, 16)

  const [{ data: manuais }, { data: vendas }, { data: devolucoes }, { data: depositos }, { data: todosProdutos }, { data: seriesEmEstoque }] = await Promise.all([
    qManuais, qVendas, qDevs,
    supabase.from('depositos').select('id, nome'),
    supabase.from('produtos').select('id, nome, codigo, controla_serie').eq('ativo', true).order('nome').limit(500),
    supabase.from('numeros_serie').select('produto_id, deposito_id, serie').eq('status', 'em_estoque').order('serie'),
  ])

  // IMEIs disponíveis por produto/depósito (para baixa de serializado na saída)
  const seriesPorProduto: Record<string, Record<string, string[]>> = {}
  for (const s of (seriesEmEstoque ?? []) as { produto_id: string; deposito_id: string; serie: string }[]) {
    if (!s.produto_id || !s.deposito_id) continue
    ;(seriesPorProduto[s.produto_id] ??= {})[s.deposito_id] ??= []
    seriesPorProduto[s.produto_id][s.deposito_id].push(s.serie)
  }

  const vendaIds = (vendas ?? []).map((v) => v.id)
  const devolucaoIds = (devolucoes ?? []).map((d) => d.id)

  // 2. Itens + mapas
  const [itensVenda, itensDev] = await Promise.all([
    vendaIds.length
      ? fetchAllIn<Record<string, unknown>>(vendaIds, (chunk, from, to) => supabase.from('itens_venda').select('id, venda_id, produto_id, quantidade, preco_unitario, total_item, produtos(nome)').in('venda_id', chunk).range(from, to))
      : Promise.resolve([] as Record<string, unknown>[]),
    devolucaoIds.length
      ? fetchAllIn<Record<string, unknown>>(devolucaoIds, (chunk, from, to) => supabase.from('itens_devolucao').select('id, devolucao_id, produto_id, nome, quantidade, preco_unitario, total_item, status_produto').in('devolucao_id', chunk).range(from, to))
      : Promise.resolve([] as Record<string, unknown>[]),
  ])

  // 3. Nomes + CUSTO de produtos (manuais + venda + devolução) e pessoas (vendas). Isa 29/07: custo no relatório.
  const prodIds = [...new Set([
    ...(manuais ?? []).map((m) => m.produto_id),
    ...(itensVenda ?? []).map((it) => it.produto_id as string),
    ...(itensDev ?? []).map((it) => it.produto_id as string),
  ].filter(Boolean))]
  const pessoaIds = [...new Set((vendas ?? []).map((v) => v.pessoa_id).filter(Boolean))] as string[]
  const [prods, { data: pessoas }] = await Promise.all([
    prodIds.length
      ? fetchAllIn<{ id: string; nome: string; codigo: string | null; preco_custo: number | null }>(prodIds, (chunk, from, to) => supabase.from('produtos').select('id, nome, codigo, preco_custo').in('id', chunk).range(from, to))
      : Promise.resolve([] as { id: string; nome: string; codigo: string | null; preco_custo: number | null }[]),
    pessoaIds.length
      ? supabase.from('pessoas').select('id, nome').in('id', pessoaIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])

  const depMap = Object.fromEntries((depositos ?? []).map((d) => [d.id, d.nome]))
  const prodMap = Object.fromEntries((prods ?? []).map((p) => [p.id, p]))
  const pessoaMap = Object.fromEntries((pessoas ?? []).map((p) => [p.id, p.nome]))
  const vendaMap = Object.fromEntries((vendas ?? []).map((v) => [v.id, v]))
  const devMap = Object.fromEntries((devolucoes ?? []).map((d) => [d.id, d]))

  // 4. Livro-razão unificado
  const linhas: Linha[] = []

  for (const m of manuais ?? []) {
    const p = prodMap[m.produto_id]
    // Perda é valorizada pelo CUSTO (quanto de dinheiro foi pro lixo). As demais
    // movimentações manuais seguem sem valor, como antes.
    const custo = m.operacao === 'perda' ? (Number((p as { preco_custo?: number | null } | undefined)?.preco_custo) || 0) : 0
    linhas.push({
      key: 'm' + m.id,
      data: m.created_at,
      tipo: m.operacao as Tipo,
      produtoId: m.produto_id,
      produto: p?.nome ?? m.produto_id,
      parte: '—',
      vendedor: '—',
      deposito: depMap[m.deposito_id] ?? '—',
      qtd: m.quantidade,
      custo: (Number(p?.preco_custo) || 0) * (Number(m.quantidade) || 0),
      valorUnitario: m.operacao === 'perda' ? custo : null,
      valorTotal: m.operacao === 'perda' ? custo * (Number(m.quantidade) || 0) : null,
      saldo: `${m.qtd_anterior} → ${m.qtd_nova}`,
      obs: m.observacao,
    })
  }

  for (const it of (itensVenda ?? []) as Record<string, unknown>[]) {
    const v = vendaMap[it.venda_id as string]
    if (!v) continue
    const nome = (it.produtos as { nome: string } | null)?.nome ?? (it.produto_id as string)
    linhas.push({
      key: 'v' + (it.id as string),
      data: v.created_at,
      tipo: 'venda',
      produtoId: it.produto_id as string,
      produto: nome,
      parte: (v.pessoa_id ? pessoaMap[v.pessoa_id] : null) ?? 'Cliente Final',
      vendedor: (v.vendedor_nome as string) || '—',
      deposito: depMap[(v.deposito_id as string) ?? ''] ?? '—',
      qtd: it.quantidade as number,
      custo: (Number(prodMap[it.produto_id as string]?.preco_custo) || 0) * (Number(it.quantidade) || 0),
      valorUnitario: it.preco_unitario as number | null,
      valorTotal: it.total_item as number,
      saldo: null,
      obs: v.numero ? `Venda #${v.numero}` : 'Venda',
    })
  }

  for (const it of (itensDev ?? []) as Record<string, unknown>[]) {
    const d = devMap[it.devolucao_id as string]
    if (!d) continue
    linhas.push({
      key: 'd' + (it.id as string),
      data: d.created_at,
      // 'ok' volta ao estoque (Devolução +); troca/defeito/avaria NÃO volta (Troca · Saída)
      tipo: (((it.status_produto as string) ?? 'ok') === 'ok' ? 'devolucao' : 'troca'),
      produtoId: it.produto_id as string,
      produto: (it.nome as string) ?? (it.produto_id as string),
      parte: d.pessoa_nome ?? 'Cliente Final',
      vendedor: (d.vendedor_nome as string) || '—',
      deposito: depMap[(d.deposito_id as string) ?? ''] ?? '—',
      qtd: it.quantidade as number,
      custo: (Number(prodMap[it.produto_id as string]?.preco_custo) || 0) * (Number(it.quantidade) || 0),
      valorUnitario: it.preco_unitario as number | null,
      valorTotal: it.total_item as number,
      saldo: null,
      obs: (((it.status_produto as string) ?? 'ok') !== 'ok' ? 'Troca — não volta ao estoque' : (d.motivo || 'Devolução')),
    })
  }

  // 5. Filtros JS + ordenação
  const vendedores = [...new Set(linhas.map((l) => l.vendedor).filter((v) => v && v !== '—'))].sort()
  let rows = linhas
  if (params.tipo) rows = rows.filter((r) => r.tipo === params.tipo)
  if (params.vendedor) rows = rows.filter((r) => r.vendedor === params.vendedor)
  if (params.produto) {
    const t = params.produto.toLowerCase()
    rows = rows.filter((r) => r.produto.toLowerCase().includes(t))
  }
  if (params.cliente) {
    const t = params.cliente.toLowerCase()
    rows = rows.filter((r) => r.parte.toLowerCase().includes(t))
  }

  const ordemAtual = params.ordem ?? 'data'
  const ordemDesc = (params.dir ?? 'desc') === 'desc'
  // PERDAS do período (pedido da Isa: "para somarmos no fim do mês").
  // Soma sobre as linhas JÁ FILTRADAS, então respeita o período/depósito escolhidos.
  const perdas = rows.filter((r) => r.tipo === 'perda')
  const perdasQtd = perdas.reduce((s, r) => s + (Number(r.qtd) || 0), 0)
  const perdasValor = perdas.reduce((s, r) => s + (Number(r.valorTotal) || 0), 0)

  rows.sort((a, b) => {
    let va: string | number = a.data
    let vb: string | number = b.data
    if (ordemAtual === 'tipo')    { va = TIPO[a.tipo]?.label ?? ''; vb = TIPO[b.tipo]?.label ?? '' }
    if (ordemAtual === 'produto') { va = a.produto; vb = b.produto }
    if (ordemAtual === 'cliente')  { va = a.parte;    vb = b.parte }
    if (ordemAtual === 'deposito') { va = a.deposito; vb = b.deposito }
    if (ordemAtual === 'qtd')     { va = a.qtd;     vb = b.qtd }
    if (va < vb) return ordemDesc ? 1 : -1
    if (va > vb) return ordemDesc ? -1 : 1
    return 0
  })
  rows = rows.slice(0, 300)

  const baseParams: Record<string, string> = {}
  if (params.tipo)     baseParams.tipo     = params.tipo
  if (params.produto)  baseParams.produto  = params.produto
  if (params.cliente)  baseParams.cliente  = params.cliente
  if (params.vendedor) baseParams.vendedor = params.vendedor
  if (params.deposito) baseParams.deposito = params.deposito
  if (params.de)       baseParams.de       = params.de
  if (params.ate)      baseParams.ate      = params.ate

  const sortLink = (ordem: string) => {
    const ativo = ordemAtual === ordem
    const nextDir = ativo ? (ordemDesc ? 'asc' : 'desc') : 'desc'
    const arrow = ativo ? (ordemDesc ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem, ...(nextDir === 'asc' ? { dir: 'asc' } : {}) }).toString()
    return { href: `/painel/estoque/historico?${qs}`, arrow, ativo }
  }

  const advancedOn = !!(params.produto || params.cliente || params.deposito || params.vendedor)

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })

  return (
    <div className="space-y-4">
      {/* Breadcrumb + contagem */}
      <div className="flex items-center gap-3">
        <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex items-center gap-2">
          <IconSwap className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Movimentações</h2>
        </div>
        <Dica texto="Histórico completo de entradas, saídas e ajustes. Use 'Nova Movimentação' para registrar compras ou corrigir quantidades em lote." lado="baixo" />
        <span className="ml-auto text-sm text-gray-400">{rows.length} registros</span>
        <ColunasToggler />
      </div>

      {/* Perdas do período — quebra/sumiço/avaria, valorizadas pelo custo */}
      {perdas.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-orange-200 bg-orange-50 px-5 py-3">
          <span className="text-sm font-semibold text-orange-800">Perdas no período</span>
          <span className="text-sm text-orange-700">
            <b className="text-base">{perdasQtd}</b> {perdasQtd === 1 ? 'unidade' : 'unidades'}
          </span>
          <span className="text-sm text-orange-700">
            Custo: <b className="text-base">{formatBRL(perdasValor)}</b>
          </span>
          <span className="ml-auto text-xs text-orange-600">
            {perdas.length} {perdas.length === 1 ? 'lançamento' : 'lançamentos'} · filtre por data pra fechar o mês
          </span>
        </div>
      )}

      {/* Movimentação salva */}
      {params.ok && !params.erro && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          Movimentação registrada.
        </div>
      )}

      {/* Banner de erro */}
      {params.erro === 'produto-nao-encontrado' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Produto não encontrado. Selecione um produto da lista de sugestões.
        </div>
      )}
      {/* Qualquer outro erro (ex: "Estoque insuficiente para dar baixa...") — a
          action manda o texto pronto em ?erro=, mas só o código
          'produto-nao-encontrado' tinha banner; o resto ficava mudo (achado
          testando de propósito 26/08: trava de estoque insuficiente
          funcionava mas a tela não avisava nada). */}
      {params.erro && params.erro !== 'produto-nao-encontrado' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.erro}
        </div>
      )}
      {params.aviso === 'imeis-duplicados' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {params.n} {Number(params.n) === 1 ? 'IMEI já estava' : 'IMEIs já estavam'} cadastrado(s) e foram ignorados. O restante entrou normalmente.
        </div>
      )}

      {/* Aba Nova Movimentação */}
      <NovaMovimentacaoForm
        depositos={depositos ?? []}
        produtos={todosProdutos ?? []}
        seriesPorProduto={seriesPorProduto}
        dataHoje={dataHoje}
        horaAgora={horaAgora}
      />

      <form method="GET" className="space-y-3">
        {/* Linha principal de filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Tipo</label>
            <select name="tipo" defaultValue={params.tipo ?? ''}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos os tipos</option>
              <option value="venda">Venda</option>
              <option value="devolucao">Devolução</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="ajuste">Ajuste</option>
              <option value="perda">Perda</option>
              <option value="troca">Troca · Saída</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">De</label>
            <input name="de" type="date" defaultValue={de}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Até</label>
            <input name="ate" type="date" defaultValue={ate}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
            Filtrar
          </button>
          <Link href="/painel/estoque/historico"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
            Limpar
          </Link>
        </div>

        {/* Busca Avançada */}
        <details open={advancedOn} className="rounded-xl border border-gray-200 bg-gray-50">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-gray-600 select-none flex items-center gap-2">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Busca Avançada
            {advancedOn && (
              <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">ativo</span>
            )}
          </summary>
          <div className="flex flex-wrap gap-3 px-4 pb-4 pt-3 items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Produto</label>
              <input name="produto" defaultValue={params.produto ?? ''} placeholder="Nome do produto..."
                className="w-52 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Cliente / Fornecedor</label>
              <input name="cliente" defaultValue={params.cliente ?? ''} placeholder="Nome do cliente..."
                className="w-52 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Depósito</label>
              <select name="deposito" defaultValue={params.deposito ?? ''}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos os depósitos</option>
                {(depositos ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Vendedor</label>
              <select name="vendedor" defaultValue={params.vendedor ?? ''}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos os vendedores</option>
                {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </details>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { col: 'data',    label: 'Data/Hora',        align: 'text-left',   dataCol: 'data' },
                { col: 'tipo',    label: 'Tipo',             align: 'text-center',  dataCol: 'tipo' },
                { col: 'produto',  label: 'Produto',   align: 'text-left',   dataCol: 'produto' },
                { col: 'deposito', label: 'Depósito',  align: 'text-left',   dataCol: 'deposito' },
                { col: 'cliente',  label: 'Cliente',   align: 'text-left',   dataCol: 'cliente' },
                { col: 'qtd',      label: 'Qtd',       align: 'text-center', dataCol: 'qtd' },
              ].map(({ col, label, align, dataCol }) => {
                const { href, arrow, ativo } = sortLink(col)
                return (
                  <th key={col} data-col={dataCol} className={`px-4 py-3 ${align} text-xs font-semibold text-gray-500 uppercase tracking-wide`}>
                    <Link href={href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${ativo ? 'text-blue-600' : ''}`}>
                      {label} <span className="text-gray-400">{arrow}</span>
                    </Link>
                  </th>
                )
              })}
              <th data-col="vlr_unit"  className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Vlr. Unit.</th>
              <th data-col="vlr_total" className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Vlr. Total</th>
              <th data-col="custo"     className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo</th>
              <th data-col="obs"       className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Observação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhuma movimentação no período.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const t = TIPO[r.tipo] ?? { label: r.tipo, cls: 'text-gray-700 bg-gray-50 border-gray-200', sinal: '' }
                return (
                  <tr key={r.key} className="hover:bg-blue-50/60 transition">
                    <td data-col="data"      className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDate(r.data)}</td>
                    <td data-col="tipo"      className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${t.cls}`}>
                        {t.label}
                      </span>
                    </td>
                    <td data-col="produto"   className="px-4 py-3 text-sm font-medium text-gray-800">{r.produto}</td>
                    <td data-col="deposito"  className="px-4 py-3 text-sm text-gray-600">{r.deposito}</td>
                    <td data-col="cliente"   className="px-4 py-3 text-sm text-gray-600">{r.parte}</td>
                    <td data-col="qtd"       className="px-4 py-3 text-center text-sm font-bold text-gray-900">
                      {t.sinal}{r.qtd}
                      {r.saldo && <span className="block text-xs font-normal text-gray-400">{r.saldo}</span>}
                    </td>
                    <td data-col="vlr_unit"  className="px-4 py-3 text-right text-sm text-gray-600">
                      {r.valorUnitario != null ? formatBRL(r.valorUnitario) : '—'}
                    </td>
                    <td data-col="vlr_total" className="px-4 py-3 text-right text-sm font-medium text-gray-800">
                      {r.valorTotal != null ? formatBRL(r.valorTotal) : '—'}
                    </td>
                    <td data-col="custo"     className="px-4 py-3 text-right text-sm text-orange-600">{r.custo > 0 ? formatBRL(r.custo) : '—'}</td>
                    <td data-col="obs"       className="px-4 py-3 text-sm text-gray-400">{r.obs || '—'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
