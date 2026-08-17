import { createServiceClient, fetchAll, requirePermissao } from '@/lib/supabase/server'
import { COL, MARCA } from '@/lib/planilha-produtos'
import { linhaSegura } from '@/lib/xlsx'
import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'

// Baixa o catálogo no mesmo formato que o importador (actions.ts) espera —
// fecha o ciclo baixar → editar no Excel → reenviar em Importar Itens.
// Exporta ativo e inativo: se filtrasse só ativo, reenviar sem querer
// "reativaria" quem tinha sido desligado por engano.
// Filtro de categoria/marca é só pra reduzir a planilha — não muda a regra
// de importação (que continua "só mexe no que o arquivo traz").

export async function GET(req: NextRequest) {
  try {
    await requirePermissao('produtos')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const categoria = req.nextUrl.searchParams.get('categoria') || undefined
  const marca = req.nextUrl.searchParams.get('marca') || undefined
  const status = req.nextUrl.searchParams.get('status') || undefined

  const supabase = await createServiceClient()
  const [produtos, categorias] = await Promise.all([
    fetchAll((from, to) => {
      let q = supabase
        .from('produtos')
        .select('id, codigo, nome, categoria, marca, preco, preco_custo, preco_minimo, ean, prateleira, modelo, unidade, ativo, controla_serie, visivel_catalogo')
        .order('nome')
      if (categoria) q = q.eq('categoria', categoria)
      if (marca) q = q.eq('marca', marca)
      if (status === 'ativos') q = q.eq('ativo', true)
      else if (status === 'inativos') q = q.eq('ativo', false)
      return q.range(from, to)
    }),
    supabase.from('categorias').select('hierarquia, nome'),
  ])
  const nomePorHierarquia = new Map((categorias.data ?? []).map((c) => [c.hierarquia, c.nome]))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Produtos')
  ws.columns = Object.values(COL).map((header) => ({ header, key: header, width: 20 }))
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

  const simNao = (v: boolean | null) => (v ? 'SIM' : 'NÃO')

  for (const p of produtos as unknown as {
    id: string; codigo: string | null; nome: string; categoria: string | null; marca: string | null
    preco: number | null; preco_custo: number | null; preco_minimo: number | null; ean: string | null
    prateleira: string | null; modelo: string | null; unidade: string | null
    ativo: boolean | null; controla_serie: boolean | null; visivel_catalogo: boolean | null
  }[]) {
    ws.addRow(linhaSegura({
      [COL.ident]: `${p.id}idproduto`,
      [COL.codigo]: p.codigo ?? '',
      [COL.nome]: p.nome,
      [COL.categoria]: p.categoria ? (nomePorHierarquia.get(p.categoria) ?? '') : '',
      [COL.marca]: p.marca ?? '',
      [COL.custo]: p.preco_custo ?? 0,
      [COL.preco]: p.preco ?? 0,
      [COL.precoMin]: p.preco_minimo ?? 0,
      [COL.ean]: p.ean ?? '',
      [COL.prateleira]: p.prateleira ?? '',
      [COL.modelo]: p.modelo ?? '',
      [COL.unidade]: p.unidade ?? '',
      [COL.inativo]: simNao(!p.ativo),
      [COL.serie]: simNao(p.controla_serie),
      [COL.catalogo]: simNao(p.visivel_catalogo),
      [COL.tipoArquivo]: MARCA,
    }))
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buf = await wb.xlsx.writeBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="produtos.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
