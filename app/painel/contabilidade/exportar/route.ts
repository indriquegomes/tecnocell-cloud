import { requirePermissao } from '@/lib/supabase/server'
import { buscarDadosContabilidade } from '@/lib/contabilidade'
import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'

// Baixa a planilha da contadora: DRE simplificado + despesas por categoria,
// compras (notas de entrada), folha (com encargos) e faturamento por dia.
export async function GET(req: NextRequest) {
  try { await requirePermissao('master') } catch { return new Response('Sem permissão.', { status: 403 }) }

  const mes = req.nextUrl.searchParams.get('mes') || ''
  const loja = req.nextUrl.searchParams.get('loja') || undefined
  if (!/^\d{4}-\d{2}$/.test(mes)) return new Response('Mês inválido.', { status: 400 })

  const d = await buscarDadosContabilidade(mes, loja)
  const wb = new ExcelJS.Workbook()

  // Resumo (DRE simplificado)
  const resumo = wb.addWorksheet('Resumo')
  resumo.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Valor (R$)', key: 'valor', width: 18 },
  ]
  resumo.addRows([
    { item: 'Faturamento bruto', valor: d.faturamento },
    { item: 'Descontos', valor: d.descontos },
    { item: 'Compras (notas de entrada)', valor: d.compras },
    { item: 'Despesas pagas', valor: d.despesasTotal },
    { item: 'Folha (salários)', valor: d.folha },
    { item: 'Folha (encargos)', valor: d.folhaEncargos },
    { item: 'Resultado', valor: d.resultado },
  ])
  resumo.getColumn('valor').numFmt = '#,##0.00'

  // Despesas por categoria
  const wsDesp = wb.addWorksheet('Despesas por categoria')
  wsDesp.columns = [
    { header: 'Categoria', key: 'categoria', width: 30 },
    { header: 'Total (R$)', key: 'total', width: 18 },
  ]
  for (const c of d.porCategoria) wsDesp.addRow({ categoria: c.categoria, total: c.total })
  wsDesp.getColumn('total').numFmt = '#,##0.00'

  // Compras
  const wsComp = wb.addWorksheet('Compras')
  wsComp.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Número', key: 'numero', width: 14 },
    { header: 'Fornecedor', key: 'fornecedor', width: 32 },
    { header: 'Valor (R$)', key: 'valor', width: 18 },
  ]
  for (const n of d.notas) wsComp.addRow(n)
  wsComp.getColumn('valor').numFmt = '#,##0.00'

  // Folha
  const wsFolha = wb.addWorksheet('Folha')
  wsFolha.columns = [
    { header: 'Nome', key: 'nome', width: 32 },
    { header: 'Cargo', key: 'cargo', width: 20 },
    { header: 'Vínculo', key: 'vinculo', width: 12 },
    { header: 'Salário (R$)', key: 'salario', width: 16 },
    { header: 'Encargos (R$)', key: 'encargos', width: 16 },
  ]
  for (const f of d.folhaLista) wsFolha.addRow({ nome: f.nome, cargo: f.cargo, vinculo: f.vinculo, salario: f.salario, encargos: f.encargos })
  wsFolha.getColumn('salario').numFmt = '#,##0.00'
  wsFolha.getColumn('encargos').numFmt = '#,##0.00'

  // Faturamento por dia
  const wsDia = wb.addWorksheet('Faturamento por dia')
  wsDia.columns = [
    { header: 'Dia', key: 'dia', width: 14 },
    { header: 'Vendas', key: 'qtd', width: 10 },
    { header: 'Total (R$)', key: 'total', width: 18 },
  ]
  for (const x of d.porDia) wsDia.addRow(x)
  wsDia.getColumn('total').numFmt = '#,##0.00'

  const buf = await wb.xlsx.writeBuffer()
  const nomeArq = 'contabilidade-' + mes + (loja ? '-' + loja : '') + '.xlsx'
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="' + nomeArq + '"',
      'Cache-Control': 'no-store',
    },
  })
}
