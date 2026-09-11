import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'
import { linhaSegura } from '@/lib/xlsx'
import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'

// Exporta TODAS as notas de entrada numa planilha (uma linha por item):
// nome, quantidade, gaveta (prateleira do produto), valor unitário e total.
// "Gaveta" = campo prateleira do produto — onde a peça fica guardada.

type NotaRow = { id: string; numero: string | null; data_entrada: string | null; status: string; pessoas: unknown }
type ItemRow = {
  nota_id: string; quantidade: number | null; preco_unitario: number | null; total_item: number | null
  created_at: string | null
  produtos: unknown
}

export async function GET(_req: NextRequest) {
  try {
    await requirePermissao('compras')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const supabase = await createServiceClient()

  const [notas, itens] = await Promise.all([
    fetchAll<NotaRow>((from, to) => supabase.from('notas_entrada').select('id, numero, data_entrada, status, pessoas(nome)').range(from, to)),
    fetchAll<ItemRow>((from, to) => supabase.from('itens_nota_entrada').select('nota_id, quantidade, preco_unitario, total_item, created_at, produtos(nome, prateleira)').range(from, to)),
  ])

  // cancelada não mexe no estoque/gaveta — não entra na planilha
  const notaPorId = new Map(notas.filter((n) => n.status !== 'cancelada').map((n) => [n.id, n]))

  const linhas = itens
    .filter((it) => notaPorId.has(it.nota_id))
    .sort((a, b) => {
      const na = notaPorId.get(a.nota_id)!
      const nb = notaPorId.get(b.nota_id)!
      return (na.data_entrada ?? '').localeCompare(nb.data_entrada ?? '')
        || (na.numero ?? '').localeCompare(nb.numero ?? '', undefined, { numeric: true })
        || (a.created_at ?? '').localeCompare(b.created_at ?? '')
    })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Notas de Entrada')
  ws.columns = [
    { header: 'Nota', key: 'nota', width: 12 },
    { header: 'Data de Entrada', key: 'data', width: 16 },
    { header: 'Fornecedor', key: 'fornecedor', width: 26 },
    { header: 'Produto', key: 'produto', width: 34 },
    { header: 'Quantidade', key: 'quantidade', width: 12 },
    { header: 'Gaveta', key: 'gaveta', width: 14 },
    { header: 'Valor Unitário', key: 'unitario', width: 15 },
    { header: 'Valor Total', key: 'total', width: 15 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

  // join aninhado (produtos/nome, pessoas/nome) volta OBJETO no runtime, mas o
  // supabase-js sem schema tipado declara como array — aceita os dois.
  const primeiro = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { nome?: string; prateleira?: string | null } | null | undefined

  for (const it of linhas) {
    const nota = notaPorId.get(it.nota_id)!
    const prod = primeiro(it.produtos)
    ws.addRow(linhaSegura({
      nota: nota.numero ?? '',
      data: nota.data_entrada ? new Date(nota.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR') : '',
      fornecedor: primeiro(nota.pessoas)?.nome ?? '',
      produto: prod?.nome ?? '',
      quantidade: Number(it.quantidade) || 0,
      gaveta: prod?.prateleira ?? '',
      unitario: Number(it.preco_unitario) || 0,
      total: Number(it.total_item) || 0,
    }))
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="notas-de-entrada.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
