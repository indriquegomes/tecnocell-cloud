import { createServiceClient, fetchAll, requirePermissaoAny } from '@/lib/supabase/server'
import { celulaSegura } from '@/lib/xlsx'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { NextRequest } from 'next/server'

// Exporta notas de entrada. Sem ?nota_id → ZIP com UM Excel por nota. Com ?nota_id
// → baixa SÓ aquela nota (.xlsx). Cada arquivo tem título (nota · fornecedor · data)
// + colunas: Produto, Quantidade, Depósito, Gaveta, Valor Unitário e Valor Total.
type NotaRow = { id: string; numero: string | null; data_entrada: string | null; status: string; pessoas: unknown }
type ItemRow = {
  nota_id: string; quantidade: number | null; preco_unitario: number | null; total_item: number | null
  created_at: string | null
  produtos: unknown
  depositos: unknown
}

const PALETA = ['FFDBEAFE', 'FFD1FAE5', 'FFFEF3C7', 'FFFCE7F3', 'FFE0E7FF', 'FFFFE4E6', 'FFE2E8F0', 'FFCFFAFE']
const corPorDeposito = new Map<string, string>()
const corDoDeposito = (nome: string) => {
  if (!corPorDeposito.has(nome)) corPorDeposito.set(nome, PALETA[corPorDeposito.size % PALETA.length])
  return corPorDeposito.get(nome)!
}

// join aninhado volta OBJETO no runtime, mas o supabase-js sem schema tipado
// declara como array — aceita os dois.
const primeiro = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { nome?: string; prateleira?: string | null } | null | undefined

function montarNota(nota: NotaRow, its: ItemRow[]): ExcelJS.Workbook {
  const fornecedor = primeiro(nota.pessoas)?.nome ?? ''
  const data = nota.data_entrada ? new Date(nota.data_entrada + 'T12:00:00').toLocaleDateString('pt-BR') : ''

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Nota')

  ws.addRow([`Nota ${nota.numero ?? ''} · ${fornecedor} · ${data}`])
  ws.getRow(1).font = { bold: true, size: 12 }

  ws.addRow(['Produto', 'Quantidade', 'Depósito', 'Gaveta', 'Valor Unitário', 'Valor Total'])
  ws.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

  for (const it of its) {
    const prod = primeiro(it.produtos)
    const deposito = primeiro(it.depositos)?.nome ?? '—'
    const row = ws.addRow([
      celulaSegura(prod?.nome ?? ''),
      Number(it.quantidade) || 0,
      celulaSegura(deposito),
      celulaSegura(prod?.prateleira ?? ''),
      Number(it.preco_unitario) || 0,
      Number(it.total_item) || 0,
    ])
    if (deposito !== '—') {
      row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: corDoDeposito(deposito) } }
    }
  }

  ws.columns.forEach((col) => { col.width = 20 })
  ws.views = [{ state: 'frozen', ySplit: 2 }]
  return wb
}

const nomeArquivo = (n: NotaRow) => {
  const base = (n.numero ?? n.id.slice(0, 8)).trim().replace(/[\\/:*?"<>|]/g, '_')
  return (base || 'sem-numero') + '.xlsx'
}

export async function GET(req: NextRequest) {
  try {
    await requirePermissaoAny(['compras', 'notas_entrada'])
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const notaId = req.nextUrl.searchParams.get('nota_id') || ''
  const supabase = await createServiceClient()

  let notasQ = supabase.from('notas_entrada').select('id, numero, data_entrada, status, pessoas(nome)')
  if (notaId) notasQ = notasQ.eq('id', notaId)
  const notas = await fetchAll<NotaRow>((from, to) => notasQ.range(from, to))

  let itensQ = supabase.from('itens_nota_entrada').select('nota_id, quantidade, preco_unitario, total_item, created_at, produtos(nome, prateleira), depositos(nome)')
  if (notaId) itensQ = itensQ.eq('nota_id', notaId)
  const itens = await fetchAll<ItemRow>((from, to) => itensQ.range(from, to))

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

  // UMA nota → .xlsx direto (não ZIP)
  if (notaId && notasValidas.length === 1) {
    const nota = notasValidas[0]
    const its = (itensPorNota.get(nota.id) ?? []).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    const buf = await montarNota(nota, its).xlsx.writeBuffer()
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="' + nomeArquivo(nota) + '"',
        'Cache-Control': 'no-store',
      },
    })
  }

  // TODAS → ZIP
  const zip = new JSZip()
  for (const nota of notasValidas) {
    const its = (itensPorNota.get(nota.id) ?? []).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    const buf = await montarNota(nota, its).xlsx.writeBuffer()
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
