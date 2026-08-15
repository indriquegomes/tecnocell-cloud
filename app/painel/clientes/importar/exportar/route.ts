import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'
import { COL } from '@/lib/planilha-clientes'
import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    await requirePermissao('clientes')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const tipo = req.nextUrl.searchParams.get('tipo') || undefined

  const supabase = await createServiceClient()
  const pessoas = await fetchAll((from, to) => {
    let q = supabase
      .from('pessoas')
      .select('id, nome, tipo, pessoa_fisica, cpf_cnpj, email, telefone, celular, cep, endereco, numero, complemento, bairro, cidade, estado, ativo')
      .order('nome')
    if (tipo) q = q.eq('tipo', tipo)
    return q.range(from, to)
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Clientes')
  ws.columns = Object.values(COL).map((header) => ({ header, key: header, width: 20 }))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

  const tipoLabel: Record<string, string> = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Ambos' }

  for (const p of pessoas as unknown as {
    id: string; nome: string; tipo: string | null; pessoa_fisica: boolean | null; cpf_cnpj: string | null
    email: string | null; telefone: string | null; celular: string | null
    cep: string | null; endereco: string | null; numero: string | null; complemento: string | null; bairro: string | null
    cidade: string | null; estado: string | null; ativo: boolean | null
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
      [COL.cep]: p.cep ?? '',
      [COL.endereco]: p.endereco ?? '',
      [COL.numero]: p.numero ?? '',
      [COL.complemento]: p.complemento ?? '',
      [COL.bairro]: p.bairro ?? '',
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
