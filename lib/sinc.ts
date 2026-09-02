// Parser e de-para da sincronização sombra SIGE → TecnoCell (Fase 4).
//
// Recebe o evento bruto capturado pela extensão (payload da sinc_inbox) e
// transforma no formato normalizado que o aplicador usa. Regra de segurança
// (decisão do dono): lista branca de formas de pagamento — só o que foi
// CONFIRMADO entra; qualquer forma desconhecida vira null (quarentena), nunca
// adivinhada. Assim é impossível colocar fiado na gaveta por engano.

export type SigeCliente = {
  id: string
  nome: string
  cpfCnpj: string
  saldoValeCredito: number
  estaInadimplente: boolean
}

export type SigePagamento = {
  valor: number
  forma: string
  parcelas: number
  bandeira: string
  condicao: string
}

export type SigeItem = {
  id: string
  codigo: string
  quantidade: number
  valorUnitario: number
  precoCusto: number
  empresa: string
  vendedorEmail: string
}

export type SaveVendaNormalizada = {
  cliente: SigeCliente | null
  pagamentos: SigePagamento[]
  itens: SigeItem[]
  vendaIdSige: string | null
}

// Forma de pagamento do SIGE → como entra no TecnoCell.
// status 'pendente' = fiado (dívida), 'pago' = entra no caixa/banco/maquininha.
// null = não mapeada → quarentena (não aplica).
export type FormaSigeMap = { formaId: string; status: 'pago' | 'pendente' | 'vale' }

// LISTA BRANCA. Só "Crédito Loja" (fiado) está confirmado com dado real.
// formaId = id em formas_pagamento (capturado do banco real).
// Demais (Dinheiro, PIX, Cartão...) entram aqui quando forem capturados.
export const FORMAS_SIGE: Record<string, FormaSigeMap> = {
  'Crédito Loja': { formaId: '63de417be94e938cc171c865', status: 'pendente' },
}

// De-para empresa (nome no SIGE) → depósito do PDV no TecnoCell.
// O cadastro foi importado com os MESMOS ObjectIds, então o id bate direto.
export const DEPOSITO_POR_EMPRESA: Record<string, string> = {
  'TECNOCELL PETRÓPOLIS': '63d9054d59a9c829747233d4', // PETRÓPOLIS LOJA
  // 'TECNOCELL TERESÓPOLIS': '63e4dc8ede713ef765366d69', // confirmar quando capturar
}

export function mapFormaSige(forma: string): FormaSigeMap | null {
  const m = FORMAS_SIGE[forma]
  return m ?? null // null → quarentena
}

function parseJson<T>(v: unknown): T | null {
  if (typeof v !== 'string') return null
  try { return JSON.parse(v) as T } catch { return null }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Parseia o corpo do POST /v2/PDV/savevenda. Retorna null se não for um savevenda.
export function parseSaveVenda(corpo: Record<string, unknown> | null | undefined, resposta: unknown): SaveVendaNormalizada | null {
  if (!corpo || typeof corpo !== 'object') return null
  if (typeof corpo.arg !== 'string' && typeof corpo.data !== 'string') return null

  const clienteRaw = parseJson<Record<string, unknown>>(corpo.arg)
  const pagamentosRaw = parseJson<Record<string, unknown>[]>(corpo.arg2)
  const itensRaw = parseJson<Record<string, unknown>[]>(corpo.data)

  const cliente: SigeCliente | null = clienteRaw
    ? {
        id: String(clienteRaw.Id ?? ''),
        nome: String(clienteRaw.Nome ?? ''),
        cpfCnpj: String(clienteRaw.CPFCNPJ ?? ''),
        saldoValeCredito: num(clienteRaw.SaldoValeCredito) ?? 0,
        estaInadimplente: clienteRaw.EstaInadimplente === true,
      }
    : null

  const pagamentos: SigePagamento[] = []
  for (const p of pagamentosRaw ?? []) {
    const valor = num(p.ValorPagamento)
    if (valor === null) return null // número malformado → não aplica
    pagamentos.push({
      valor,
      forma: String(p.FormaPagamento ?? ''),
      parcelas: num(p.Parcelas) ?? 1,
      bandeira: String(p.BandeiraCartao ?? ''),
      condicao: String(p.CondicaoPagamento ?? ''),
    })
  }

  const itens: SigeItem[] = []
  for (const i of itensRaw ?? []) {
    const quantidade = num(i.Quantidade)
    const valorUnitario = num(i.ValorUnitario)
    if (quantidade === null || valorUnitario === null) return null
    itens.push({
      id: String(i.Id ?? ''),
      codigo: String(i.Codigo ?? ''),
      quantidade,
      valorUnitario,
      precoCusto: num(i.PrecoCusto) ?? 0,
      empresa: String(i.Empresa ?? ''),
      vendedorEmail: String(i.UsuarioVendedor ?? ''),
    })
  }

  // A resposta é um array: ["PADRAO", <vendaId>, <gerenId>, ...].
  const vendaIdSige = Array.isArray(resposta) && resposta.length > 1 ? String(resposta[1] ?? '') : null

  return { cliente, pagamentos, itens, vendaIdSige }
}
