import { createServiceClient, fetchAll, fetchAllIn, requirePermissao } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'

// Baixa a Reposição como planilha — o Vitor pediu Excel pra a estoquista fazer o
// pedido. Mesmíssimo cálculo da tela (vendeu ÷ dias × dias-de-estoque − estoque),
// respeitando os filtros que vieram na URL (de/até/categoria/depósito/cobrir).
export async function GET(req: NextRequest) {
  try {
    await requirePermissao('estoque')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const supabase = await createServiceClient()

  const hoje = hojeSP()
  const ate = sp.get('ate') || hoje
  const de = sp.get('de') || (() => { const d = new Date(ate + 'T00:00:00'); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10) })()
  const cobrir = Math.max(1, parseInt(sp.get('cobrir') ?? '30', 10) || 30)
  const PRAZO_REPOSICAO = 12   // prazo real do pedido chegar (Vitor, 16/07) — igual à tela
  const categoria = sp.get('categoria') || ''
  const deposito = sp.get('deposito') || ''
  const dias = (() => {
    const d = new Date(de + 'T00:00:00'), a = new Date(ate + 'T00:00:00')
    return Math.max(1, Math.round((a.getTime() - d.getTime()) / 86_400_000) + 1)
  })()

  // 1) vendido no período por produto
  let vq = supabase
    .from('itens_venda')
    .select('produto_id, quantidade, venda:vendas!inner ( created_at, status, deposito_id )')
    .eq('venda.status', 'concluida')
    .gte('venda.created_at', de + 'T00:00:00')
    .lte('venda.created_at', ate + 'T23:59:59')
  if (deposito) vq = vq.eq('venda.deposito_id', deposito)
  const itens = await fetchAll<{ produto_id: string; quantidade: number }>(
    (from, to) => vq.range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number }[] | null }>,
  )
  const vendidoPorProd: Record<string, number> = {}
  for (const i of itens) vendidoPorProd[i.produto_id] = (vendidoPorProd[i.produto_id] ?? 0) + Number(i.quantidade)
  // histórico do SIGE (só na visão "Todos os depósitos"), igual à tela
  if (!deposito) {
    const hist = await fetchAll<{ produto_id: string; quantidade: number }>(
      (from, to) => supabase.from('historico_itens_venda').select('produto_id, quantidade').gte('data', de).lte('data', ate).range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number }[] | null }>,
    )
    for (const h of hist) vendidoPorProd[h.produto_id] = (vendidoPorProd[h.produto_id] ?? 0) + Number(h.quantidade)
  }
  const ids = Object.keys(vendidoPorProd)

  const produtos = ids.length
    ? await fetchAllIn<{ id: string; nome: string; codigo: string | null; categoria: string | null; cat: { nome: string } | null }>(
        ids,
        (chunk, from, to) => {
          let q = supabase.from('produtos').select('id, nome, codigo, categoria, cat:categorias!categoria ( nome )').in('id', chunk)
          if (categoria) q = q.eq('categoria', categoria)
          return q.range(from, to) as unknown as PromiseLike<{ data: { id: string; nome: string; codigo: string | null; categoria: string | null; cat: { nome: string } | null }[] | null }>
        },
      )
    : []

  const estoquePorProd: Record<string, number> = {}
  if (produtos.length) {
    const pids = produtos.map((p) => p.id)
    const est = await fetchAllIn<{ produto_id: string; quantidade: number; deposito_id: string }>(
      pids,
      (chunk, from, to) => supabase.from('estoque').select('produto_id, quantidade, deposito_id').in('produto_id', chunk).range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number; deposito_id: string }[] | null }>,
    )
    for (const e of est) {
      if (deposito && e.deposito_id !== deposito) continue
      estoquePorProd[e.produto_id] = (estoquePorProd[e.produto_id] ?? 0) + Number(e.quantidade)
    }
  }

  const linhas = produtos.map((p) => {
    const vendido = vendidoPorProd[p.id] ?? 0
    const estoque = estoquePorProd[p.id] ?? 0
    const mediaDia = vendido / dias
    const dura = mediaDia > 0 ? estoque / mediaDia : Infinity
    const sugestao = Math.max(0, Math.ceil(mediaDia * cobrir - estoque))
    const urgente = mediaDia > 0 && dura < PRAZO_REPOSICAO
    return { ...p, vendido, estoque, mediaDia, dura, sugestao, urgente }
  }).sort((a, b) => b.sugestao - a.sugestao || b.vendido - a.vendido)

  // 2) monta o Excel
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Reposição')
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Produto', key: 'nome', width: 46 },
    { header: 'Categoria', key: 'categoria', width: 16 },
    { header: `Vendeu (${dias}d)`, key: 'vendido', width: 12 },
    { header: 'Média/dia', key: 'media', width: 11 },
    { header: 'Estoque', key: 'estoque', width: 10 },
    { header: 'Dura (dias)', key: 'dura', width: 12 },
    { header: 'PEDIR', key: 'pedir', width: 10 },
    { header: 'Urgente', key: 'urgente', width: 10 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

  for (const l of linhas) {
    const row = ws.addRow({
      codigo: l.codigo ?? '',
      nome: l.nome,
      categoria: l.cat?.nome ?? '',
      vendido: l.vendido,
      media: Number(l.mediaDia.toFixed(2)),
      estoque: l.estoque,
      dura: l.dura === Infinity ? '' : Math.round(l.dura),
      pedir: l.sugestao || '',
      urgente: l.urgente ? 'SIM' : '',
    })
    if (l.urgente) row.getCell('urgente').font = { bold: true, color: { argb: 'FFB23B32' } }
    if (l.sugestao > 0) row.getCell('pedir').font = { bold: true }
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // aba de legenda/parâmetros usados (pra a estoquista lembrar o que gerou os números)
  const info = wb.addWorksheet('Parâmetros')
  info.columns = [{ header: 'Parâmetro', key: 'k', width: 28 }, { header: 'Valor', key: 'v', width: 30 }]
  info.getRow(1).font = { bold: true }
  info.addRows([
    { k: 'Período de venda', v: `${de} a ${ate} (${dias} dias)` },
    { k: 'Estoque desejado', v: `${cobrir} dias de venda` },
    { k: 'Depósito', v: deposito ? '(filtrado)' : 'Todos' },
    { k: 'Categoria', v: categoria ? '(filtrada)' : 'Todas' },
    { k: 'Fórmula do PEDIR', v: 'média/dia × dias de estoque − estoque atual' },
    { k: 'Gerado em', v: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) },
  ])

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reposicao-${de}-a-${ate}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
