import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'
import { celulaSegura } from '@/lib/xlsx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { NextRequest } from 'next/server'

// Exporta as notas de entrada: UM Excel por nota, tudo dentro de um ZIP.
// Cada arquivo tem título (nota · fornecedor · data) + colunas: Produto,
// Quantidade, Gaveta (prateleira), Valor Unitário e Valor Total.

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

  // join aninhado volta OBJETO no runtime, mas o supabase-js sem schema tipado
  // declara como array — aceita os dois.
  const primeiro = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { nome?: string; prateleira?: string | null } | null | undefined

  // cancelada não mexe no estoque/gaveta — não entra
  const notasValidas = notas
    .filter((n) => n.status !== 'cancelada')
    .sort((a, b) => (a.data_entrada ?? '').localeCompare(b.data_entrada ?? '')
      || (a.numero ?? '').localeCompare(b.numero ?? '', undefined, { numeric: true }))

  const itensPorNota = new Map<string, ItemRow[]>()
  for (const it of itens) {
    if (!notasValidas.some((n) => n.id === it.nota_id)) continue
    const lista = itensPorNota.get(it.nota_id) ?? []
    lista.push(it)
    itensPorNota.set(it.nota_id, lista)
  }

  const nomeArquivo = (n: NotaRow) => {
    const base = (n.numero ?? n.id.slice(0, 8)).trim().replace(/[\\/:*?"<>|]/g, '_')
    return (base || 'sem-numero') + '.xlsx'
  }

  const zip = new JSZip()

  for (const nota of notasValidas) {
    const its = (itensPorNota.get(nota.id) ?? []).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    const fornecedor = primeiro(nota.pessoas)?.nome ?? ''
    const data = nota.data_entrada ? new Date(nota.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR') : ''

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Nota')

    // título
    ws.addRow([`Nota ${nota.numero ?? ''} · ${fornecedor} · ${data}`])
    ws.getRow(1).font = { bold: true, size: 12 }

    // cabeçalho
    ws.addRow(['Produto', 'Quantidade', 'Gaveta', 'Valor Unitário', 'Valor Total'])
    ws.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

    for (const it of its) {
      const prod = primeiro(it.produtos)
      ws.addRow([
        celulaSegura(prod?.nome ?? ''),
        Number(it.quantidade) || 0,
        celulaSegura(prod?.prateleira ?? ''),
        Number(it.preco_unitario) || 0,
        Number(it.total_item) || 0,
      ])
    }

    ws.columns.forEach((col) => { col.width = 20 })
    ws.views = [{ state: 'frozen', ySplit: 2 }]

    const buf = await wb.xlsx.writeBuffer()
    zip.file(nomeArquivo(nota), buf)
  }

  const zipBuf = await zip.generateAsync({ type: 'arraybuffer' })
  return new Response(zipBuf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="notas-de-entrada.zip"',
      'Cache-Control': 'no-store',
    },
  })
}
