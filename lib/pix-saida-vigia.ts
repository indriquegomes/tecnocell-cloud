// O lado do aviso que o robô NÃO vê sozinho: devolução em PIX paga no app que
// nunca chegou como print no grupo.
//
// O robô só conhece o que alguém manda. Quem esquece de mandar o print some — e é
// exatamente aí que o app fica com devolução em PIX sem origem do dinheiro. Esta
// parte faz a pergunta ao contrário, uma vez por dia.
//
// Puro (sem Supabase, sem Telegram) para ter teste: quem chama é a rota de cron.

import { formatBRL } from '@/lib/utils'
import { diaDoCampo } from '@/lib/pix-saida'

export type LancamentoPixPago = {
  id: string
  valor: number
  status: string | null
  descricao: string | null
  pessoaNome: string | null
  forma: string | null
  /** dia do pagamento (aceita data pura em timestamptz — ver diaDoCampo) */
  diaPagamento: string | null
  /** devolucao_id: a linha nasceu de devolução mesmo com descrição fora do padrão */
  devolucaoId?: string | null
  /** true quando já existe comprovante ligado a esta conta */
  temComprovante?: boolean
}

const diaBR = (d: string | null) => {
  const dia = diaDoCampo(d)
  return dia ? dia.split('-').reverse().join('/') : 'sem data'
}

/**
 * Devoluções em PIX pagas que não têm comprovante ligado.
 *
 * Conta tudo o que é `pagar` + forma PIX + já pago: se o dinheiro saiu, tem que
 * existir print; se não saiu, alguém marcou pago sem o dinheiro sair — os dois
 * casos precisam de gente olhando, e a mensagem diz qual é qual.
 */
export function semComprovante(linhas: LancamentoPixPago[]): LancamentoPixPago[] {
  const ehDevolucao = (l: LancamentoPixPago) =>
    // Duas famílias de descrição no Financeiro: Devolução — … e Estorno de crédito — devolução da venda #…. Filtrar só a primeira deixava metade das devoluções fora do aviso.
    !!l.devolucaoId || /^(devolu|estorno)/i.test(String(l.descricao ?? ''))
  return (linhas ?? [])
    .filter((l) => l && l.id)
    .filter((l) => !/cancelad/i.test(String(l.status ?? '')))
    .filter((l) => String(l.status ?? '') === 'pago')
    .filter(ehDevolucao)
    .filter((l) => /pix|fora/i.test(String(l.forma ?? '')))
    .filter((l) => !l.temComprovante)
}

/** O recado do dia. Devolve null quando não há nada a avisar (silêncio = tudo em ordem). */
export function montarAviso(linhas: LancamentoPixPago[], opcoes: { dias?: number; maximo?: number } = {}): string | null {
  const dias = opcoes.dias ?? 7
  const maximo = opcoes.maximo ?? 15
  const lista = semComprovante(linhas)
  if (lista.length === 0) return null

  const total = lista.reduce((s, l) => s + Number(l.valor ?? 0), 0)
  const mostradas = lista.slice(0, maximo).map((l) => {
    const foraDoApp = /fora/i.test(String(l.forma ?? ''))
    const quem = String(l.pessoaNome ?? '').trim() || String(l.descricao ?? '').replace(/^Devolu[çc][ãa]o\s*[—–-]\s*/i, '').trim() || 'sem nome'
    return `• ${diaBR(l.diaPagamento)} · ${quem} · ${formatBRL(Number(l.valor ?? 0))}${foraDoApp ? ' · (marcada "fora do app")' : ''}`
  })

  const resto = lista.length > mostradas.length ? `\n(+${lista.length - mostradas.length} outras)` : ''
  return [
    `🧾 Devoluções em PIX pagas nos últimos ${dias} dias SEM comprovante no grupo:`,
    mostradas.join('\n') + resto,
    `Total: ${lista.length} ${lista.length === 1 ? 'conta' : 'contas'} · ${formatBRL(total)}`,
    '',
    'Manda o print do PIX (e o cartão da devolução) aqui que eu ligo a prova.',
    'Se o dinheiro não saiu, a conta está paga sem o PIX ter existido — avise o dono.',
  ].join('\n')
}
