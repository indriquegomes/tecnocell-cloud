import { createServiceClient, fetchAll, fetchAllIn, requirePermissao } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'

// Baixa o histórico de movimentações como planilha, respeitando exatamente os
// filtros da tela (tipo/produto/cliente/vendedor/depósito/período). Ao contrário
// da tela (que corta em 300 linhas), exporta TUDO do período — o dono pediu a
// planilha de devoluções de qualquer intervalo pra conferir no balcão.
const TIPO_LABEL: Record<string, string> = {
  venda: 'Venda',
  devolucao: 'Devolução',
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
  perda: 'Perda',
  uso_interno: 'Uso interno',
  troca: 'Troca · Saída',
}

type Row = {
  data: string
  tipo: string
  produto: string
  deposito: string
  cliente: string
  vendedor: string
  qtd: number
  vlrUnit: number | null
  vlrTotal: number | null
  custo: number
  obs: string
}

export async function GET(req: NextRequest) {
  try {
    await requirePermissao('estoque')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const tipo = sp.get('tipo') || ''
  const produto = (sp.get('produto') || '').trim()
  const cliente = (sp.get('cliente') || '').trim().toLowerCase()
  const vendedor = sp.get('vendedor') || ''
  const deposito = sp.get('deposito') || ''

  // Datas no fuso de São Paulo, igual à tela (de padrão = 90 dias atrás).
  const agoraBr = new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' })
  const hoje = agoraBr.slice(0, 10)
  const de90 = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) })()
  const de = sp.get('de') || de90
  const ate = sp.get('ate') || hoje
  const ini = de + 'T00:00:00-03:00'
  const fim = ate + 'T23:59:59-03:00'

  const supabase = await createServiceClient()

  // Produto pesquisado → IDs (mesmo critério da tela: nome OU código).
  let produtoIds: string[] | null = null
  if (produto) {
    const { data: ps } = await supabase
      .from('produtos')
      .select('id')
      .or(`nome.ilike.%${produto}%,codigo.ilike.%${produto}%`)
      .limit(200)
    produtoIds = ((ps ?? []) as { id: string }[]).map((p) => p.id)
    if (produtoIds.length === 0) produtoIds = ['__nenhum__']
  }
  const porProduto = !!produtoIds

  const selManual = 'id, produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, created_at'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let manuais: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vendas: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let devolucoes: any[] = []
  let itensVenda: Record<string, unknown>[] = []
  let itensDev: Record<string, unknown>[] = []

  if (porProduto) {
    const [mv, iv, idv] = await Promise.all([
      fetchAllIn<Record<string, unknown>>(produtoIds!, (chunk, from, to) =>
        supabase.from('movimentacoes_estoque').select(selManual).in('produto_id', chunk).gte('created_at', ini).lte('created_at', fim).order('created_at', { ascending: false }).range(from, to)),
      fetchAllIn<Record<string, unknown>>(produtoIds!, (chunk, from, to) =>
        supabase.from('itens_venda').select('id, venda_id, produto_id, quantidade, preco_unitario, total_item, produtos(nome)').in('produto_id', chunk).range(from, to)),
      fetchAllIn<Record<string, unknown>>(produtoIds!, (chunk, from, to) =>
        supabase.from('itens_devolucao').select('id, devolucao_id, produto_id, nome, quantidade, preco_unitario, total_item, status_produto').in('produto_id', chunk).range(from, to)),
    ])
    manuais = mv
    itensVenda = iv
    itensDev = idv
    const vIds = [...new Set((iv as { venda_id: string | null }[]).map((i) => i.venda_id).filter(Boolean))] as string[]
    const dIds = [...new Set((idv as { devolucao_id: string | null }[]).map((i) => i.devolucao_id).filter(Boolean))] as string[]
    const [vr, dr] = await Promise.all([
      vIds.length
        ? fetchAllIn<Record<string, unknown>>(vIds, (chunk, from, to) => {
            let q = supabase.from('vendas').select('id, numero, created_at, vendedor_nome, pessoa_id, deposito_id, status').in('id', chunk).gte('created_at', ini).lte('created_at', fim)
            if (deposito) q = q.eq('deposito_id', deposito)
            return q.range(from, to)
          })
        : Promise.resolve([] as Record<string, unknown>[]),
      dIds.length
        ? fetchAllIn<Record<string, unknown>>(dIds, (chunk, from, to) => {
            let q = supabase.from('devolucoes').select('id, created_at, pessoa_nome, vendedor_nome, deposito_id, motivo').in('id', chunk).gte('created_at', ini).lte('created_at', fim)
            if (deposito) q = q.eq('deposito_id', deposito)
            return q.range(from, to)
          })
        : Promise.resolve([] as Record<string, unknown>[]),
    ])
    vendas = vr
    devolucoes = dr
    // drop itens cujo pai foi filtrado por depósito
    const vendaSet = new Set(vendas.map((v) => v.id as string))
    const devSet = new Set(devolucoes.map((d) => d.id as string))
    itensVenda = itensVenda.filter((i) => vendaSet.has(i.venda_id as string))
    itensDev = itensDev.filter((i) => devSet.has(i.devolucao_id as string))
    if (deposito) manuais = manuais.filter((m) => m.deposito_id === deposito)
  } else {
    const [mv, v, dv] = await Promise.all([
      fetchAll<Record<string, unknown>>((from, to) => {
        let q = supabase.from('movimentacoes_estoque').select(selManual).gte('created_at', ini).lte('created_at', fim).order('created_at', { ascending: false })
        if (deposito) q = q.eq('deposito_id', deposito)
        return q.range(from, to)
      }),
      fetchAll<Record<string, unknown>>((from, to) => {
        let q = supabase.from('vendas').select('id, numero, created_at, vendedor_nome, pessoa_id, deposito_id, status').neq('status', 'aberta').gte('created_at', ini).lte('created_at', fim).order('created_at', { ascending: false })
        if (deposito) q = q.eq('deposito_id', deposito)
        return q.range(from, to)
      }),
      fetchAll<Record<string, unknown>>((from, to) => {
        let q = supabase.from('devolucoes').select('id, created_at, pessoa_nome, vendedor_nome, deposito_id, motivo').gte('created_at', ini).lte('created_at', fim).order('created_at', { ascending: false })
        if (deposito) q = q.eq('deposito_id', deposito)
        return q.range(from, to)
      }),
    ])
    manuais = mv
    vendas = v
    devolucoes = dv
    const vendaIds = (vendas ?? []).map((x) => x.id as string)
    const devolucaoIds = (devolucoes ?? []).map((x) => x.id as string)
    const [iv, idv] = await Promise.all([
      vendaIds.length
        ? fetchAllIn<Record<string, unknown>>(vendaIds, (chunk, from, to) => supabase.from('itens_venda').select('id, venda_id, produto_id, quantidade, preco_unitario, total_item, produtos(nome)').in('venda_id', chunk).range(from, to))
        : Promise.resolve([] as Record<string, unknown>[]),
      devolucaoIds.length
        ? fetchAllIn<Record<string, unknown>>(devolucaoIds, (chunk, from, to) => supabase.from('itens_devolucao').select('id, devolucao_id, produto_id, nome, quantidade, preco_unitario, total_item, status_produto').in('devolucao_id', chunk).range(from, to))
        : Promise.resolve([] as Record<string, unknown>[]),
    ])
    itensVenda = iv
    itensDev = idv
  }

  // Nomes + custo + pessoas + depósitos (mesma montagem da tela)
  const prodIds = [...new Set([
    ...(manuais ?? []).map((m) => m.produto_id as string),
    ...(itensVenda ?? []).map((it) => it.produto_id as string),
    ...(itensDev ?? []).map((it) => it.produto_id as string),
  ].filter(Boolean))]
  const pessoaIds = [...new Set((vendas ?? []).map((v) => v.pessoa_id as string).filter(Boolean))] as string[]
  const [prods, pessoas, depositos] = await Promise.all([
    prodIds.length
      ? fetchAllIn<{ id: string; nome: string; codigo: string | null; preco_custo: number | null }>(prodIds, (chunk, from, to) => supabase.from('produtos').select('id, nome, codigo, preco_custo').in('id', chunk).range(from, to))
      : Promise.resolve([] as { id: string; nome: string; codigo: string | null; preco_custo: number | null }[]),
    pessoaIds.length
      ? supabase.from('pessoas').select('id, nome').in('id', pessoaIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    supabase.from('depositos').select('id, nome'),
  ])

  const depMap = Object.fromEntries(((depositos?.data) ?? []).map((d) => [d.id, d.nome]))
  const prodMap = Object.fromEntries((prods ?? []).map((p) => [p.id, p]))
  const pessoaMap = Object.fromEntries(((pessoas?.data) ?? []).map((p) => [p.id, p.nome]))
  const vendaMap = Object.fromEntries((vendas ?? []).map((v) => [v.id, v]))
  const devMap = Object.fromEntries((devolucoes ?? []).map((d) => [d.id, d]))

  const linhas: Row[] = []

  for (const m of manuais ?? []) {
    const p = prodMap[m.produto_id as string]
    const custo = m.operacao === 'perda' ? (Number(p?.preco_custo) || 0) : 0
    linhas.push({
      data: m.created_at as string,
      tipo: m.operacao as string,
      produto: p?.nome ?? (m.produto_id as string),
      deposito: depMap[m.deposito_id as string] ?? '—',
      cliente: '—',
      vendedor: '—',
      qtd: m.quantidade as number,
      vlrUnit: m.operacao === 'perda' ? custo : null,
      vlrTotal: m.operacao === 'perda' ? custo * (Number(m.quantidade) || 0) : null,
      custo: (Number(p?.preco_custo) || 0) * (Number(m.quantidade) || 0),
      obs: (m.observacao as string | null) ?? '',
    })
  }

  for (const it of itensVenda ?? []) {
    const v = vendaMap[it.venda_id as string]
    if (!v) continue
    const nome = (it.produtos as { nome: string } | null)?.nome ?? (it.produto_id as string)
    linhas.push({
      data: v.created_at as string,
      tipo: 'venda',
      produto: nome,
      deposito: depMap[v.deposito_id as string] ?? '—',
      cliente: (v.pessoa_id ? pessoaMap[v.pessoa_id as string] : null) ?? 'Cliente Final',
      vendedor: (v.vendedor_nome as string) || '—',
      qtd: it.quantidade as number,
      vlrUnit: it.preco_unitario as number | null,
      vlrTotal: it.total_item as number,
      custo: (Number(prodMap[it.produto_id as string]?.preco_custo) || 0) * (Number(it.quantidade) || 0),
      obs: v.numero ? `Venda #${v.numero}` : 'Venda',
    })
  }

  for (const it of itensDev ?? []) {
    const d = devMap[it.devolucao_id as string]
    if (!d) continue
    linhas.push({
      data: d.created_at as string,
      tipo: (((it.status_produto as string) ?? 'ok') === 'ok' ? 'devolucao' : 'troca'),
      produto: (it.nome as string) ?? (it.produto_id as string),
      deposito: depMap[d.deposito_id as string] ?? '—',
      cliente: (d.pessoa_nome as string) ?? 'Cliente Final',
      vendedor: (d.vendedor_nome as string) || '—',
      qtd: it.quantidade as number,
      vlrUnit: it.preco_unitario as number | null,
      vlrTotal: it.total_item as number,
      custo: (Number(prodMap[it.produto_id as string]?.preco_custo) || 0) * (Number(it.quantidade) || 0),
      obs: (((it.status_produto as string) ?? 'ok') !== 'ok' ? 'Troca — não volta ao estoque' : ((d.motivo as string) || 'Devolução')),
    })
  }

  // Filtros JS (iguais à tela) + ordem cronológica (mais natural pra ler período)
  let rows = linhas
  if (tipo) rows = rows.filter((r) => r.tipo === tipo)
  if (vendedor) rows = rows.filter((r) => r.vendedor === vendedor)
  if (cliente) rows = rows.filter((r) => r.cliente.toLowerCase().includes(cliente))
  rows.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Movimentações')
  ws.columns = [
    { header: 'Data/Hora', key: 'data', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Produto', key: 'produto', width: 42 },
    { header: 'Depósito', key: 'deposito', width: 16 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    { header: 'Vendedor', key: 'vendedor', width: 18 },
    { header: 'Qtd', key: 'qtd', width: 8 },
    { header: 'Vlr. Unit.', key: 'vlrUnit', width: 12 },
    { header: 'Vlr. Total', key: 'vlrTotal', width: 12 },
    { header: 'Custo', key: 'custo', width: 12 },
    { header: 'Observação', key: 'obs', width: 30 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

  for (const r of rows) {
    ws.addRow({
      data: fmtDate(r.data),
      tipo: TIPO_LABEL[r.tipo] ?? r.tipo,
      produto: r.produto,
      deposito: r.deposito,
      cliente: r.cliente,
      vendedor: r.vendedor === '—' ? '' : r.vendedor,
      qtd: r.qtd,
      vlrUnit: r.vlrUnit ?? '',
      vlrTotal: r.vlrTotal ?? '',
      custo: r.custo || '',
      obs: r.obs,
    })
  }
  ws.getColumn('vlrUnit').numFmt = 'R$ #,##0.00'
  ws.getColumn('vlrTotal').numFmt = 'R$ #,##0.00'
  ws.getColumn('custo').numFmt = 'R$ #,##0.00'
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const rotulo = tipo ? (TIPO_LABEL[tipo] ?? tipo) : 'movimentacoes'
  const nomeArq = `historico-${rotulo}-${de}-a-${ate}.xlsx`.replace(/\s+/g, '-')
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArq}"`,
      'Cache-Control': 'no-store',
    },
  })
}
