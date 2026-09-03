// Parser e de-para da sincronização sombra SIGE → TecnoCell (Fase 4).
//
// Recebe o evento bruto capturado pela extensão (payload da sinc_inbox) e
// transforma no formato normalizado que o aplicador usa. Regra de segurança
// (decisão do dono): lista branca de formas de pagamento — só o que foi
// CONFIRMADO entra; qualquer forma desconhecida vira null (quarentena), nunca
// adivinhada. Assim é impossível colocar fiado na gaveta por engano.

import { createHash } from 'crypto'

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
  'Crédito Loja': { formaId: '63de417be94e938cc171c865', status: 'pendente' }, // fiado
  'Dinheiro': { formaId: 'FP001', status: 'pago' },
  'PIX': { formaId: 'FP003', status: 'pago' },
  'Cartão de Crédito': { formaId: 'FP002', status: 'pago' },
  'Cartão de Débito': { formaId: 'FP004', status: 'pago' },
  // 'Vale Crédito' -> FP_VALE (status 'vale') entra quando o vale for tratado.
}

// De-para empresa (nome no SIGE) → depósito do PDV no TecnoCell.
// O cadastro foi importado com os MESMOS ObjectIds, então o id bate direto.
export const DEPOSITO_POR_EMPRESA: Record<string, string> = {
  'TECNOCELL PETRÓPOLIS': '63d9054d59a9c829747233d4', // PETRÓPOLIS LOJA
  // 'TECNOCELL TERESÓPOLIS': '63e4dc8ede713ef765366d69', // confirmar quando capturar
}

// Empresa (nome no SIGE) → loja (nome em lojas, resolvido por nome no worker).
export const LOJA_POR_EMPRESA: Record<string, string> = {
  'TECNOCELL PETRÓPOLIS': 'Petrópolis',
  // 'TECNOCELL TERESÓPOLIS': 'Teresópolis', // confirmar quando capturar
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
// uuid v5 determinístico (mesma semente -> mesmo id) — igual ao carregar-fiados.mjs.
// O SaveCrediario referencia IdLancamento do SIGE; com ele achamos o lançamento aqui.
export function uuidFiado(seed: string): string {
  const h = createHash('sha1').update('tecnocell:fiado:' + seed).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.toString('hex')
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20, 32)
}

export type RecebimentoFiado = { forma: string; valorPago: number; lancamentos: { id: string; idLancamento: string }[] }

export type MovimentacaoEstoqueSige = {
  produtoIdSige: string
  codigo: string
  depositoId: string
  operacao: 'entrada' | 'saida'
  quantidade: number
  data: string
  produto: string
  observacao: string | null
}

export function parseMovimentacaoEstoque(corpo: Record<string, unknown> | null | undefined): MovimentacaoEstoqueSige[] | null {
  if (!corpo || typeof corpo.data !== 'string') return null
  const data = parseJson<{ movements?: Record<string, unknown>[]; obs?: unknown }>(corpo.data)
  if (!data?.movements?.length) return null
  const resultado: MovimentacaoEstoqueSige[] = []
  for (const m of data.movements) {
    const tipo = String(m.tipo ?? '').toLowerCase()
    const quantidade = num(m.quantidade)
    const partes = /^(\d{2})\/(\d{2})\/(\d{4}) - (\d{2}):(\d{2})$/.exec(String(m.data ?? ''))
    if ((tipo !== 'entrada' && tipo !== 'saida') || !quantidade || quantidade <= 0 || !partes) return null
    const [, dia, mes, ano, hora, minuto] = partes
    resultado.push({
      produtoIdSige: String(m.produtoID ?? ''),
      codigo: String(m.produtoCodigoNFE ?? m.produtoCodigo ?? ''),
      depositoId: String(m.depositoID ?? ''),
      operacao: tipo,
      quantidade,
      data: new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`).toISOString(),
      produto: String(m.produto ?? ''),
      observacao: String(data.obs ?? '').trim() || null,
    })
  }
  return resultado
}

// Parseia o POST /v2/PDV/SaveCrediario (receber fiado). corpo.data é JSON string.
export function parseSaveCrediario(corpo: Record<string, unknown> | null | undefined): RecebimentoFiado | null {
  if (!corpo) return null
  let data: unknown = corpo.data
  if (typeof corpo.data === 'string') { try { data = JSON.parse(corpo.data) } catch { return null } }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const valorPago = num(d.ValorPago ?? d.PagamentoValorPagar)
  if (valorPago === null) return null
  const check = Array.isArray(d.LancamentosCheck) ? (d.LancamentosCheck as Record<string, unknown>[]) : []
  const lancamentos = check
    .map((lc) => String(lc.IdLancamento ?? ''))
    .filter(Boolean)
    .map((idLancamento) => ({ id: uuidFiado(idLancamento), idLancamento }))
  return { forma: String(d.Forma ?? ''), valorPago, lancamentos }
}

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

// ── Devolução de mercadoria ────────────────────────────────────────────────
//
// O PDV do SIGE grava devolução via POST /v2/OperacoesPDV/Salvar. O corpo real:
//   arg   = JSON string: array de itens [{ VendaID, VendaProdutoID, ProdutoID,
//           ProdutoCodigo, QuantidadeVendida, QuantidadeJaDevolvida,
//           QuantidadeDevolvida, ValorUnitario, ValorTotal, ValorDevolucao,
//           DepositoID, ... }]  (só interessa QuantidadeDevolvida > 0)
//   arg3  = nome do cliente (JSON string com aspas, ex.: "BRUNA ALVES")
//   data  = JSON string: { TipoOperacao: 4, Valores: [{ Descricao, Valor }] }
//           — a Descricao do Valores[0] é a FORMA de reembolso.
// Resposta: { ValeId, Success, OperacaoId } — OperacaoId é o id estável da
//           devolução (idempotência). ValeId preenchido = estornou em vale.
//
// "cancelamento" no SIGE não tem endpoint próprio: devolver TUDO é o cancelamento
// (a venda vira "Pedido Cancelado"). Logo este mesmo parser/aplicador cobre os dois.

export type ItemDevolucaoSige = {
  codigo: string
  quantidade: number
  valorUnitario: number
  totalItem: number
  depositoId: string
  // ProdutoStatus do SIGE: null = devolução normal (volta ao estoque). Qualquer
  // valor preenchido = "PRODUTO COM DEFEITO" (GetStatusProdutos só retorna esse:
  // id 63dac2294207a276bf341648) → NÃO volta pro estoque.
  statusProduto: 'ok' | 'defeito'
}

export type DevolucaoSige = {
  vendaIdSige: string
  clienteNome: string
  forma: string             // Descricao original do SIGE (ex.: "Vale Crédito")
  tipoCredito: string | null // de-para (null = forma não mapeada → quarentena)
  depositoId: string
  itens: ItemDevolucaoSige[]
  operacaoId: string        // id estável da devolução (resposta.OperacaoId)
}

// Lista branca de forma de reembolso da devolução → p_tipo_credito do RPC.
export const DEVOLUCAO_FORMA: Record<string, string> = {
  'Vale Crédito': 'credito_conta',   // gera crédito no cliente (creditos_clientes)
  'Crédito Loja': 'cancelamento_fiado', // abate a dívida (fiado) — o RPC faz o abate
  'PIX': 'pix',                      // vira lançamento "pagar"
  'Cartão de Crédito': 'credito',
  'Cartão de Débito': 'debito',
  'Dinheiro': 'dinheiro',            // sai da gaveta (movimentos_caixa 'devolucao') no worker
}

export function parseDevolucao(
  corpo: Record<string, unknown> | null | undefined,
  resposta: unknown,
): DevolucaoSige | null {
  if (!corpo || typeof corpo !== 'object') return null

  const itensRaw = parseJson<Record<string, unknown>[]>(corpo.arg)
  if (!Array.isArray(itensRaw) || itensRaw.length === 0) return null

  const data = parseJson<Record<string, unknown>>(corpo.data)
  if (!data || data.TipoOperacao !== 4) return null // 4 = devolução (outros tipos = caixa)

  const resp = (resposta ?? {}) as Record<string, unknown>
  const operacaoId = String(resp.OperacaoId ?? '')
  if (!operacaoId) return null // falhou no SIGE (sem OperacaoId) → não é devolução real

  // nome do cliente vem em arg3 como JSON string com aspas (ex.: "BRUNA ALVES")
  const clienteNome = parseJson<string>(corpo.arg3) ?? String(corpo.arg3 ?? '').replace(/^"|"$/g, '')

  const valores = Array.isArray(data.Valores) ? (data.Valores as Record<string, unknown>[]) : []
  if (valores.length !== 1) return null // reembolso misto não tratado (raro)
  const forma = String(valores[0].Descricao ?? '')
  const tipoCredito = DEVOLUCAO_FORMA[forma] ?? null

  const itens: ItemDevolucaoSige[] = []
  let vendaIdSige = ''
  let depositoId = ''
  for (const i of itensRaw) {
    const quantidade = num(i.QuantidadeDevolvida)
    if (quantidade === null || quantidade <= 0) continue
    const codigo = String(i.ProdutoCodigo ?? '')
    const valorUnitario = num(i.ValorUnitario)
    const totalItem = num(i.ValorDevolucao)
    if (!codigo || valorUnitario === null || totalItem === null) return null
    vendaIdSige = vendaIdSige || String(i.VendaID ?? '')
    depositoId = depositoId || String(i.DepositoID ?? '')
    // ProdutoStatusId/ProdutoStatus preenchido = item marcado com defeito.
    const statusProduto: 'ok' | 'defeito' = (i.ProdutoStatusId || i.ProdutoStatus) ? 'defeito' : 'ok'
    itens.push({ codigo, quantidade, valorUnitario, totalItem, depositoId: String(i.DepositoID ?? ''), statusProduto })
  }
  if (!vendaIdSige || itens.length === 0) return null

  return { vendaIdSige, clienteNome, forma, tipoCredito, depositoId, itens, operacaoId }
}
// ── Caixa ─────────────────────────────────────────────────────────────────
//
// Operações de caixa do SIGE → RPC aplicar_caixa_sige (atômica, idempotente).
// Endpoints canônicos (o que a funcionária dispara ao abrir/fechar):
//   /OperacoesPDV/FecharCaixa          → fechamento (resposta.inicio = JSON
//                                        string com FechamentoDeCaixa)
//   /OperacoesPDV/Salvar TipoOperacao 0 → abertura
//   /OperacoesPDV/Salvar TipoOperacao 2 → sangria
//   /OperacoesPDV/ReforcarCaixa          → reforço
//   /OperacoesPDV/Salvar TipoOperacao 4 → devolução (parseDevolucao, NÃO aqui)
//
// Decisão do conselho: valor_fechamento fica NULL quando o SIGE fecha "às cegas"
// (ValoresInformados null = sem contagem). Aqui o fechamento só expõe o Dinheiro
// pra reconciliação — nunca como valor contado.
//
// Auxiliares AbrirCaixa/SangrarCaixa/BuscarDadosCaixa (Id null) são PREVIEW —
// não são commit e caem em quarentena (rota não reconhecida).

export type CaixaSige = {
  tipo: 'abertura' | 'fechamento' | 'sangria' | 'reforco'
  sigeId: string        // ObjectId estável (idempotência)
  caixaSige: string     // CaixaID do SIGE (identidade do caixa/operador)
  empresaNome: string
  data: string          // ISO (America/Sao_Paulo)
  valor: number | null  // abertura=valor_abertura · sangria/reforço=quantia · fechamento=Dinheiro
  motivo: string | null
}

// "03/09/2026 - 16:38" → ISO com -03:00 (nunca toISOString pra data operacional).
function dataSige(texto: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) - (\d{2}):(\d{2})$/.exec(String(texto ?? ''))
  if (!m) return null
  const [, dia, mes, ano, hora, minuto] = m
  return new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`).toISOString()
}

// Acha o valor de uma forma pelo nome (ex.: 'Dinheiro') no array Valores do SIGE.
// Mapeia por NOME, não por posição (o array não tem ordem fixa — conselho).
function valorPorDescricao(valores: unknown, descricao: string): number | null {
  if (!Array.isArray(valores)) return null
  const v = valores.find((x) => (x as Record<string, unknown>)?.Descricao === descricao)
  return v ? num((v as Record<string, unknown>).Valor) : null
}

export function parseCaixa(
  rota: string,
  corpo: Record<string, unknown> | null | undefined,
  resposta: unknown,
): CaixaSige | null {
  if (!rota) return null

  // Fechamento — a resposta vem aninhada: { inicio: "{\"FechamentoDeCaixa\":{...}}" }.
  if (/\/FecharCaixa$/i.test(rota)) {
    const resp = (resposta ?? {}) as Record<string, unknown>
    const inicio = parseJson<Record<string, unknown>>(resp.inicio)
    const f = (inicio?.FechamentoDeCaixa ?? {}) as Record<string, unknown>
    const sigeId = String(f.Id ?? '')
    if (!sigeId) return null
    const data = dataSige(f.Data)
    if (!data) return null
    return {
      tipo: 'fechamento',
      sigeId,
      caixaSige: String(f.CaixaID ?? ''),
      empresaNome: String(f.EmpresaNome ?? ''),
      data,
      valor: valorPorDescricao(f.Valores, 'Dinheiro'),
      motivo: String(f.Observacoes ?? '').trim() || null,
    }
  }

  // Salvar genérico — abertura (0) e sangria (2). Devolução (4) é parseDevolucao.
  if (/\/OperacoesPDV\/Salvar$/i.test(rota)) {
    const data = parseJson<Record<string, unknown>>(corpo?.data)
    if (!data) return null
    const tipoOp = Number(data.TipoOperacao)
    const resp = (resposta ?? {}) as Record<string, unknown>
    const sigeId = String(resp.OperacaoId ?? '')
    if (!sigeId) return null
    const dataISO = dataSige(data.Data)
    if (!dataISO) return null
    if (tipoOp === 0) {
      return {
        tipo: 'abertura',
        sigeId,
        caixaSige: String(data.CaixaID ?? ''),
        empresaNome: String(data.EmpresaNome ?? ''),
        data: dataISO,
        valor: num(data.Valor) ?? valorPorDescricao(data.Valores, 'Dinheiro'),
        motivo: null,
      }
    }
    if (tipoOp === 2) {
      return {
        tipo: 'sangria',
        sigeId,
        caixaSige: String(data.CaixaID ?? ''),
        empresaNome: String(data.EmpresaNome ?? ''),
        data: dataISO,
        valor: valorPorDescricao(data.Valores, 'Dinheiro') ?? num(data.Valor),
        motivo: String(data.MotivoSangria ?? '').trim() || null,
      }
    }
    return null // TipoOperacao 1/4 não passam por aqui
  }

  // Reforço — endpoint próprio (não passa pelo Salvar).
  if (/\/ReforcarCaixa$/i.test(rota)) {
    const resp = (resposta ?? {}) as Record<string, unknown>
    const d = (resp.Data ?? resp.data ?? {}) as Record<string, unknown>
    const valor = num(d.Valor) ?? valorPorDescricao(d.Valores, 'Dinheiro')
    const sigeId = String(resp.OperacaoId ?? '')
    if (!sigeId || !valor) return null
    return {
      tipo: 'reforco',
      sigeId,
      caixaSige: String(d.CaixaID ?? ''),
      empresaNome: String(d.EmpresaNome ?? ''),
      data: dataSige(d.Data) ?? new Date().toISOString(),
      valor,
      motivo: String(d.MotivoSangria ?? '').trim() || null,
    }
  }

  return null
}

// ── Transferência entre depósitos ──────────────────────────────────────────
// POST /v3/EstoqueMovEntreDepositos/save-edit (capturado 03/09).
// corpo.arg = JSON array de itens [{produtoCodigoNFe, quantidade, numerosSerie}];
// corpo.data = JSON {depositoOrigemID, depositoDestinoID, observacao}.
// resposta.Data.Data.Id = ObjectId estável (idempotência).

export type ItemTransferenciaSige = {
  codigo: string
  quantidade: number
  series: { serie: string }[]
}

export type TransferenciaSige = {
  sigeId: string
  origemId: string
  destinoId: string
  observacao: string | null
  itens: ItemTransferenciaSige[]
}

function seriesDe(numerosSerie: unknown): { serie: string }[] {
  if (!Array.isArray(numerosSerie)) return []
  const out: { serie: string }[] = []
  for (const s of numerosSerie) {
    const serie = typeof s === 'string'
      ? s
      : String((s as Record<string, unknown>)?.serie ?? (s as Record<string, unknown>)?.NumeroSerie ?? '')
    if (serie) out.push({ serie })
  }
  return out
}

export function parseTransferencia(
  corpo: Record<string, unknown> | null | undefined,
  resposta: unknown,
): TransferenciaSige | null {
  if (!corpo) return null
  const data = parseJson<Record<string, unknown>>(corpo.data)
  const arg = parseJson<Record<string, unknown>[]>(corpo.arg)
  if (!data || !Array.isArray(arg) || arg.length === 0) return null

  const origemId = String(data.depositoOrigemID ?? '')
  const destinoId = String(data.depositoDestinoID ?? '')
  if (!origemId || !destinoId) return null

  const resp = (resposta ?? {}) as Record<string, unknown>
  const respData = (resp.Data ?? {}) as Record<string, unknown>
  const respInner = (respData.Data ?? {}) as Record<string, unknown>
  const sigeId = String(respInner.Id ?? '')
  if (!sigeId) return null

  const itens: ItemTransferenciaSige[] = []
  for (const i of arg) {
    const quantidade = num(i.quantidade)
    const codigo = String(i.produtoCodigoNFe ?? '')
    if (quantidade === null || quantidade <= 0 || !codigo) return null
    itens.push({ codigo, quantidade, series: seriesDe(i.numerosSerie) })
  }

  return { sigeId, origemId, destinoId, observacao: String(data.observacao ?? '').trim() || null, itens }
}

