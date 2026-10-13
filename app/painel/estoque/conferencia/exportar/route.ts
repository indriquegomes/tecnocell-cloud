import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { buscarLinhasConferencia } from '@/lib/conferencia'
import ExcelJS from 'exceljs'
import type { NextRequest } from 'next/server'

// Baixa a planilha de CONFERÊNCIA de um depósito: cada produto com seu saldo
// atual no sistema + uma coluna "Correção" em branco pra estoquista lançar a
// diferença do físico. Sempre por depósito (obrigatório) + categoria opcional.
// A listagem vem de lib/conferencia.ts (mesma fonte da tela on-screen).
export async function GET(req: NextRequest) {
  try {
    await requirePermissao('estoque')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const deposito = sp.get('deposito') || ''
  const categoria = sp.get('categoria') || ''

  // conferência é SEMPRE por depósito — sem depósito, não gera
  if (!deposito) {
    return new Response('Escolha um depósito para a conferência.', { status: 400 })
  }

  const supabase = await createServiceClient()

  // nome do depósito (pra cabeçalho e nome do arquivo)
  const { data: dep } = await supabase.from('depositos').select('nome').eq('id', deposito).maybeSingle()
  const nomeDeposito = dep?.nome ?? 'deposito'

  // produtos + saldo atual desse depósito, já ordenados pela gaveta
  const linhas = await buscarLinhasConferencia(deposito, categoria)

  // monta o Excel
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Conferência')
  ws.columns = [
    { header: 'ID', key: 'id', width: 38 },
    { header: 'Código', key: 'codigo', width: 12 },
    { header: 'Gaveta', key: 'gaveta', width: 12 },
    { header: 'Produto', key: 'nome', width: 46 },
    { header: 'Categoria', key: 'categoria', width: 18 },
    { header: 'Saldo sistema', key: 'saldo', width: 14 },
    { header: 'Correção (+/-)', key: 'correcao', width: 16 },
    { header: 'Obs', key: 'obs', width: 22 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } }

  for (const l of linhas) {
    const row = ws.addRow({
      id: l.id,
      codigo: l.codigo,
      gaveta: l.gaveta,
      nome: l.nome,
      categoria: l.categoria,
      saldo: l.saldo,
      correcao: '',
      obs: l.serial ? 'IMEI — não conferir aqui' : '',
    })
    if (l.serial) {
      row.getCell('obs').font = { italic: true, color: { argb: 'FF999999' } }
      row.getCell('correcao').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
    }
  }

  ws.getColumn('id').hidden = true
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // aba de instruções
  const info = wb.addWorksheet('Como usar')
  info.columns = [{ header: 'Passo', key: 'k', width: 10 }, { header: 'O que fazer', key: 'v', width: 70 }]
  info.getRow(1).font = { bold: true }
  info.addRows([
    { k: '1', v: 'Confira o físico de cada produto contando na prateleira.' },
    { k: '2', v: 'Na coluna "Correção (+/-)", escreva a diferença: -1 se falta 1, +3 se sobra 3.' },
    { k: '3', v: 'Deixe em branco os produtos que já estão certos (não precisa mexer).' },
    { k: '4', v: 'NÃO apague nem mude as colunas ID, Código e Saldo sistema.' },
    { k: '5', v: 'Produtos marcados "IMEI" não entram nesta conferência (são controlados por número de série).' },
    { k: '6', v: 'Salve o arquivo e reenvie na tela de Conferência.' },
    { k: '', v: '' },
    { k: 'Depósito', v: nomeDeposito },
    { k: 'Gerado em', v: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) },
  ])

  const buf = await wb.xlsx.writeBuffer()
  const dataArq = hojeSP()
  const nomeArq = `conferencia-${nomeDeposito}-${dataArq}.xlsx`.replace(/\s+/g, '-')
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArq}"`,
      'Cache-Control': 'no-store',
    },
  })
}
