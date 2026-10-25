// A RÉGUA ÚNICA DO DINHEIRO.
//
// Existe porque a mesma pergunta ("quanto tenho a receber?") era respondida de
// um jeito em cada tela: uma somava o valor cheio, outra o que falta, outra
// somava tudo que já foi pago junto. Duas telas, dois números, mesmo rótulo.
//
// Aqui ficam as SEIS contas que podem existir. Tela nenhuma inventa a sétima.
// Este arquivo não escreve nada no banco: é só cálculo, sobre dados que já estão lá.

export type StatusLanc = 'pendente' | 'pago' | 'cancelado' | string | null

export type Lancamento = {
  tipo: string
  status: StatusLanc
  valor: number | null
  valor_pago: number | null
  data_pagamento?: string | null
  data_vencimento?: string | null
}

// Quanto desta linha já foi realmente pago.
//
// A regra que resolve 1.423 linhas sem tocar em nenhuma: quando o lançamento
// está marcado 'pago' e o campo valor_pago está vazio/zero, o valor cheio conta
// como pago. NÃO preenche o campo — a linha continua exatamente como está
// gravada; muda só a conta que é feita em cima dela.
export function pagoReal(l: Lancamento): number {
  const pago = Number(l.valor_pago ?? 0)
  if (l.status === 'pago' && pago <= 0) return Number(l.valor ?? 0)
  return pago
}

// 1. FALTA ENTRAR — dívida de cliente que ainda não foi paga.
// 2. FALTA SAIR — conta que ainda não foi paga.
// Só status 'pendente' entra: 'cancelado' não é dívida e 'pago' não falta.
export function faltaPagarOuReceber(l: Lancamento): number {
  if (l.status !== 'pendente') return 0
  return Math.max(0, Number(l.valor ?? 0) - pagoReal(l))
}

// 3. JÁ ENTROU — o que efetivamente foi recebido.
// 4. JÁ SAIU — o que efetivamente foi pago.
export function jaPago(l: Lancamento): number {
  if (l.status === 'cancelado') return 0
  return pagoReal(l)
}

// 5. COMBINADO — falta + já. É o total do período (o "pago + pendente").
export function combinado(l: Lancamento): number {
  if (l.status === 'cancelado') return 0
  return jaPago(l) + faltaPagarOuReceber(l)
}

// 6. DINHEIRO NA GAVETA — abertura + o que entrou − o que saiu, SÓ em dinheiro.
// Reforço entra; retirada e devolução saem. PIX e cartão não são gaveta.
export type MovimentoCaixa = { tipo: string; forma_pagamento: string | null; valor: number | null }

export function ehDinheiro(m: MovimentoCaixa): boolean {
  return (m.forma_pagamento || 'dinheiro').trim().toLowerCase() === 'dinheiro'
}

export function dinheiroNaGaveta(abertura: number, movs: MovimentoCaixa[]): number {
  let saldo = Number(abertura) || 0
  for (const m of movs) {
    if (!ehDinheiro(m)) continue
    const v = Number(m.valor ?? 0)
    if (m.tipo === 'recebimento' || m.tipo === 'reforco') saldo += v
    else if (m.tipo === 'retirada' || m.tipo === 'devolucao') saldo -= v
  }
  return Math.round(saldo * 100) / 100
}

// Somatórios prontos, para nenhuma tela repetir o reduce.
export const somar = {
  faltaReceber: (ls: Lancamento[]) => ls.reduce((s, l) => s + (l.tipo === 'receber' ? faltaPagarOuReceber(l) : 0), 0),
  faltaPagar: (ls: Lancamento[]) => ls.reduce((s, l) => s + (l.tipo === 'pagar' ? faltaPagarOuReceber(l) : 0), 0),
  jaEntrou: (ls: Lancamento[]) => ls.reduce((s, l) => s + (l.tipo === 'receber' ? jaPago(l) : 0), 0),
  jaSaiu: (ls: Lancamento[]) => ls.reduce((s, l) => s + (l.tipo === 'pagar' ? jaPago(l) : 0), 0),
  combinadoReceber: (ls: Lancamento[]) => ls.reduce((s, l) => s + (l.tipo === 'receber' ? combinado(l) : 0), 0),
  combinadoPagar: (ls: Lancamento[]) => ls.reduce((s, l) => s + (l.tipo === 'pagar' ? combinado(l) : 0), 0),
}

// As regras do dinheiro, escritas para o dono ler — não é comentário técnico,
// é a lista que explica por que a conta é assim.
export const REGRAS_DINHEIRO: { titulo: string; texto: string }[] = [
  { titulo: 'Um número só por pergunta', texto: 'Cada tela escolhe uma das seis contas. Nenhuma tela faz conta própria.' },
  { titulo: 'Pago é pago', texto: 'Lançamento marcado como pago conta pelo valor cheio, mesmo que o campo "quanto foi pago" esteja vazio.' },
  { titulo: 'Cancelado não é dívida', texto: 'Status cancelado fica fora de falta, de pago e de combinado.' },
  { titulo: 'Falta = valor menos o que já foi pago', texto: 'Pagamento parcial desconta sozinho; a dívida que sobra é o que aparece.' },
  { titulo: 'Período por vencimento, dinheiro por data de pagamento', texto: 'O que falta olha o vencimento. O que já entrou ou saiu olha a data em que o dinheiro andou.' },
  { titulo: 'Gaveta é só dinheiro', texto: 'PIX e cartão não entram na contagem da gaveta. Abertura + recebimentos + reforços − retiradas − devoluções.' },
  { titulo: 'Venda feita não é dinheiro que entrou', texto: 'Fiado é venda feita e não paga. As telas mostram as duas coisas separadas, com nome diferente.' },
]
