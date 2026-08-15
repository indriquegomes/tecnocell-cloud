import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'
import { COL } from '@/lib/planilha-clientes'
import ExcelJS from 'exceljs'

export async function GET() {
  try {
    await requirePermissao('clientes')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const supabase = await createServiceClient()
  const pessoas = await fetchAll((from, to) => supabase
    .from('pessoas')
    .select('id, nome, tipo, pessoa_fisica, cpf_cnpj, email, telefone, celular, cidade, estado, ativo')
    .order('nome')
    .range(from, to))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Clientes')
  ws.columns = Object.values(COL).map((header) => ({ header, key: header, width: 20 }))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

  const tipoLabel: Record<string, string> = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Ambos' }

  for (const p of pessoas as unknown as {
    id: string; nome: string; tipo: string | null; pessoa_fisica: boolean | null; cpf_cnpj: string | null
    email: string | null; telefone: string | null; celular: string | null; cidade: string | null
    estado: string | null; ativo: boolean | null
  }[]) {
    ws.addRow({
      [COL.id]: p.id,
      [COL.nome]: p.nome,
      [COL.tipo]: tipoLabel[p.tipo ?? ''] ?? 'Cliente',
      [COL.pessoaFisica]: p.pessoa_fisica ? 'Física' : 'Jurídica',
      [COL.cpfCnpj]: p.cpf_cnpj ?? '',
      [COL.email]: p.email ?? '',
      [COL.telefone]: p.telefone ?? '',
      [COL.celular]: p.celular ?? '',
      [COL.cidade]: p.cidade ?? '',
      [COL.estado]: p.estado ?? '',
      [COL.ativo]: p.ativo ? 'SIM' : 'NÃO',
    })
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="clientes.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
