'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { sincronizarEstoqueML } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'
import ExcelJS from 'exceljs'

export type LinhaConf = {
  linha: number
  produto_id: string
  nome: string
  saldoAtual: number
  correcao: number
  novoSaldo: number
}

export type ResultadoConferencia =
  | { ok: false; erros: string[] }
  | { ok: true; mudancas: LinhaConf[]; deposito_id: string; depositoNome: string }

function parseCorrecao(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Math.round(v)
  const s = String(v).trim().replace(',', '.')
  if (s === '') return 0
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : NaN
}

export async function conferirPlanilha(formData: FormData): Promise<ResultadoConferencia> {
  try {
    await requirePermissao('estoque')
  } catch {
    return { ok: false, erros: ['Sem permissao para mexer no estoque.'] }
  }

  const deposito_id = (formData.get('deposito_id') as string | null)?.trim() || ''
  if (!deposito_id) {
    return { ok: false, erros: ['Deposito nao informado. Volte e escolha o deposito antes de enviar.'] }
  }

  const file = formData.get('arquivo') as File | null
  if (!file || file.size === 0) {
    return { ok: false, erros: ['Nenhum arquivo enviado. Escolha a planilha preenchida.'] }
  }

  const supabase = await createServiceClient()

  const { data: dep } = await supabase.from('depositos').select('nome').eq('id', deposito_id).maybeSingle()
  const depositoNome = dep?.nome ?? '(deposito)'

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return { ok: false, erros: ['Nao consegui ler o arquivo. Ele precisa ser a planilha .xlsx baixada aqui, salva sem mudar o formato.'] }
  }
  const ws = wb.getWorksheet('Conferencia') ?? wb.getWorksheet('Conferência') ?? wb.worksheets[0]
  if (!ws) {
    return { ok: false, erros: ['A planilha esta vazia ou em formato inesperado.'] }
  }

  const header: Record<string, number> = {}
  ws.getRow(1).eachCell((cell, col) => { header[String(cell.value ?? '').trim()] = col })
  const colId = header['ID']
  const colSaldo = header['Saldo sistema']
  const colCorr = header['Correcao (+/-)'] ?? header['Correção (+/-)']
  const colNome = header['Produto']
  if (!colId || !colCorr || !colSaldo) {
    return { ok: false, erros: ['A planilha nao tem as colunas esperadas (ID, Saldo sistema, Correcao). Use a planilha baixada aqui, sem apagar colunas.'] }
  }

  const erros: string[] = []
  const mudancas: LinhaConf[] = []
  const idsParaChecar: { id: string; linha: number; nome: string; saldo: number; correcao: number }[] = []

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const id = String(row.getCell(colId).value ?? '').trim()
    if (!id) continue

    const nome = colNome ? String(row.getCell(colNome).value ?? '').trim() : id
    const correcao = parseCorrecao(row.getCell(colCorr).value)
    const saldo = parseCorrecao(row.getCell(colSaldo).value)

    if (Number.isNaN(correcao)) {
      erros.push(`Linha ${r} (${nome}): correcao invalida — use so numero, ex: -1 ou 3.`)
      continue
    }
    if (correcao === 0) continue

    idsParaChecar.push({ id, linha: r, nome, saldo, correcao })
  }

  if (idsParaChecar.length > 0) {
    const ids = idsParaChecar.map((x) => x.id)
    const { data: prods } = await supabase
      .from('produtos')
      .select('id, nome, controla_serie')
      .in('id', ids)
    const mapProd = new Map((prods ?? []).map((p) => [p.id, p]))

    for (const item of idsParaChecar) {
      const p = mapProd.get(item.id)
      if (!p) {
        erros.push(`Linha ${item.linha} (${item.nome}): produto nao encontrado no sistema.`)
        continue
      }
      if (p.controla_serie) {
        erros.push(`Linha ${item.linha} (${item.nome}): produto com IMEI nao pode ser corrigido por aqui.`)
        continue
      }
      const novoSaldo = item.saldo + item.correcao
      if (novoSaldo < 0) {
        erros.push(`Linha ${item.linha} (${item.nome}): a correcao ${item.correcao > 0 ? '+' : ''}${item.correcao} deixaria o estoque negativo (${item.saldo} para ${novoSaldo}).`)
        continue
      }
      mudancas.push({
        linha: item.linha,
        produto_id: item.id,
        nome: item.nome,
        saldoAtual: item.saldo,
        correcao: item.correcao,
        novoSaldo,
      })
    }
  }

  if (erros.length > 0) {
    return { ok: false, erros }
  }
  if (mudancas.length === 0) {
    return { ok: false, erros: ['Nenhuma correcao preenchida na planilha. Preencha a coluna Correcao e reenvie.'] }
  }

  return { ok: true, mudancas, deposito_id, depositoNome }
}

export async function aplicarConferencia(payload: {
  deposito_id: string
  mudancas: LinhaConf[]
}): Promise<{ ok: boolean; aplicadas: number; erro?: string }> {
  const user = await requirePermissao('estoque')
  const supabase = await createServiceClient()

  const { deposito_id, mudancas } = payload
  if (!deposito_id || !Array.isArray(mudancas) || mudancas.length === 0) {
    return { ok: false, aplicadas: 0, erro: 'Nada para aplicar.' }
  }

  const dataHoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const observacao = `CORRIGIDO ATRAVES DA CONFERENCIA em ${dataHoje}`

  let aplicadas = 0
  for (const m of mudancas) {
    const operacao = m.correcao > 0 ? 'entrada' : 'saida'
    const quantidade = Math.abs(m.correcao)
    const { error } = await supabase.rpc('movimentar_estoque', {
      p_produto_id: m.produto_id,
      p_deposito_id: deposito_id,
      p_operacao: operacao,
      p_quantidade: quantidade,
      p_series: [],
      p_observacao: observacao,
      p_user: user.id,
      p_created_at: new Date().toISOString(),
    })
    if (error) {
      return { ok: false, aplicadas, erro: `Erro no produto ${m.nome}: ${error.message}. Foram aplicadas ${aplicadas} antes de parar.` }
    }
    void sincronizarEstoqueML(m.produto_id)
    aplicadas++
  }

  revalidatePath('/painel/estoque')
  revalidatePath('/painel/estoque/historico')
  return { ok: true, aplicadas }
}