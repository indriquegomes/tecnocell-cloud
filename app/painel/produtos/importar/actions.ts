'use server'

import { requirePermissao } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

// PASSO 1 da importação de itens do SIGE: só INSPECIONA o arquivo.
// Nada é gravado. Serve pra descobrir o formato real da exportação do SIGE
// antes de escrever o mapeamento de campo (nome, categoria, preço...).

const MAX_LINHAS_PREVIA = 20

export type Previa = {
  aba: string
  abasDisponiveis: string[]
  colunas: string[]
  totalLinhas: number
  linhas: string[][]
}

export type ResultadoInspecao =
  | { ok: false; erro: string }
  | { ok: true; previa: Previa }

// Célula do ExcelJS pode vir como número, data, fórmula ({ result }) ou
// rich text ({ richText: [...] }). Tudo vira string pra exibição.
function celulaTexto(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text?: string }[]; text?: string }
    if (o.richText) return o.richText.map((p) => p.text ?? '').join('')
    if (o.text !== undefined) return String(o.text)
    if (o.result !== undefined) return celulaTexto(o.result)
    return ''
  }
  return String(v).trim()
}

export async function inspecionarPlanilha(formData: FormData): Promise<ResultadoInspecao> {
  try {
    await requirePermissao('produtos')
  } catch {
    return { ok: false, erro: 'Sem permissao para mexer no cadastro de produtos.' }
  }

  const file = formData.get('arquivo') as File | null
  if (!file || file.size === 0) {
    return { ok: false, erro: 'Nenhum arquivo enviado. Escolha a planilha baixada do SIGE.' }
  }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return {
      ok: false,
      erro: 'Nao consegui ler o arquivo. Precisa ser .xlsx — se o SIGE exportou .xls ou .csv, abra no Excel e salve como "Pasta de Trabalho do Excel (.xlsx)".',
    }
  }

  const abasDisponiveis = wb.worksheets.map((w) => w.name)
  const nomeAba = (formData.get('aba') as string | null)?.trim() || ''
  const ws = (nomeAba ? wb.getWorksheet(nomeAba) : null) ?? wb.worksheets[0]
  if (!ws) return { ok: false, erro: 'A planilha esta vazia.' }

  // Cabeçalho = linha 1. Coluna sem título vira "(coluna N)" pra não sumir da lista.
  const colunas: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const t = celulaTexto(cell.value)
    colunas.push(t || `(coluna ${col})`)
  })
  if (colunas.length === 0) {
    return { ok: false, erro: `A aba "${ws.name}" nao tem linha de cabecalho na primeira linha.` }
  }

  const linhas: string[][] = []
  for (let r = 2; r <= ws.rowCount && linhas.length < MAX_LINHAS_PREVIA; r++) {
    const row = ws.getRow(r)
    const celulas = colunas.map((_, i) => celulaTexto(row.getCell(i + 1).value))
    if (celulas.every((c) => c === '')) continue
    linhas.push(celulas)
  }

  return {
    ok: true,
    previa: {
      aba: ws.name,
      abasDisponiveis,
      colunas,
      totalLinhas: Math.max(0, ws.rowCount - 1),
      linhas,
    },
  }
}
