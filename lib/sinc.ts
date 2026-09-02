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
export type FormaSigeMap = { status: 'pago' | 'pendente' }

// LISTA BRANCA. Só "Crédito Loja" (fiado) está confirmado com dado real.
// Demais (Dinheiro, PIX, Cartão...) entram aqui quando forem capturados.
export const FORMAS_SIGE: Record<string, FormaSigeMap> = {
  'Crédito Loja': { status: 'pendente' },
}

export function mapFormaSige(forma: string): FormaSigeMap | null {
  const m = FORMAS_SIGE[forma]
  return m ?? null // null → quarentena
}

function parseJson<T>(v: unknown): T | null {
  if (typeof v !== 'string') return null
  try { return JSON.parse(v) as T } catch { return null }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0) || 0
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
        saldoValeCredito: num(clienteRaw.SaldoValeCredito),
        estaInadimplente: clienteRaw.EstaInadimplente === true,
      }
    : null

  const pagamentos: SigePagamento[] = (pagamentosRaw ?? []).map((p) => ({
    valor: num(p.ValorPagamento),
    forma: String(p.FormaPagamento ?? ''),
    parcelas: num(p.Parcelas) || 1,
    bandeira: String(p.BandeiraCartao ?? ''),
    condicao: String(p.CondicaoPagamento ?? ''),
  }))

  const itens: SigeItem[] = (itensRaw ?? []).map((i) => ({
    id: String(i.Id ?? ''),
    codigo: String(i.Codigo ?? ''),
    quantidade: num(i.Quantidade),
    valorUnitario: num(i.ValorUnitario),
    precoCusto: num(i.PrecoCusto),
    empresa: String(i.Empresa ?? ''),
    vendedorEmail: String(i.UsuarioVendedor ?? ''),
  }))

  // A resposta é um array: ["PADRAO", <vendaId>, <gerenId>, ...].
  const vendaIdSige = Array.isArray(resposta) && resposta.length > 1 ? String(resposta[1] ?? '') : null

  return { cliente, pagamentos, itens, vendaIdSige }
}
