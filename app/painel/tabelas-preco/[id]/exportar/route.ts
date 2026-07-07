import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest, ctx: RouteContext<'/painel/tabelas-preco/[id]/exportar'>) {
  const { id } = await ctx.params
  try {
    await requirePermissao('produtos')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const supabase = await createServiceClient()
  const [{ data: tabela }, produtos, itens] = await Promise.all([
    supabase.from('tabelas_preco').select('nome').eq('id', id).single(),
    fetchAll((from, to) => supabase.from('produtos').select('codigo, nome, preco, preco_custo').eq('ativo', true).order('nome').order('id').range(from, to)),
    fetchAll((from, to) => supabase.from('itens_tabela_preco').select('produto_id, preco, quantidade_minima, produtos(codigo)').eq('tabela_id', id).order('id').range(from, to)),
  ])
  if (!tabela) return new Response('Tabela não encontrada.', { status: 404 })

  // preço base (menor qtd mínima) por código, pra round-trip
  const precoPorCodigo = new Map<string, { preco: number; qtd: number }>()
  for (const it of (itens ?? []) as unknown as { preco: number; quantidade_minima: number; produtos: { codigo: string | null } | null }[]) {
    const cod = it.produtos?.codigo
    if (!cod) continue
    const atual = precoPorCodigo.get(cod)
    if (!atual || it.quantidade_minima < atual.qtd) precoPorCodigo.set(cod, { preco: it.preco, qtd: it.quantidade_minima })
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Preços')
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 14 },
    { header: 'Produto', key: 'nome', width: 48 },
    { header: 'Custo', key: 'custo', width: 12 },
    { header: 'Preço padrão', key: 'padrao', width: 14 },
    { header: 'Preço nesta tabela', key: 'preco', width: 18 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  const moeda = 'R$ #,##0.00'
  for (const p of (produtos ?? []) as unknown as { codigo: string | null; nome: string; preco: number | null; preco_custo: number | null }[]) {
    const naTabela = p.codigo ? precoPorCodigo.get(p.codigo) : undefined
    const row = ws.addRow({
      codigo: p.codigo ?? '',
      nome: p.nome,
      custo: p.preco_custo ?? 0,
      padrao: p.preco ?? 0,
      preco: naTabela ? naTabela.preco : null,
    })
    row.getCell('custo').numFmt = moeda
    row.getCell('padrao').numFmt = moeda
    row.getCell('preco').numFmt = moeda
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  const slug = tabela.nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="tabela-${slug}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
