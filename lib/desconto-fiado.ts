// DESCONTO NO FIADO — a regra em um lugar só.
//
// Três coisas diferentes podem acontecer quando o cliente não paga o combinado, e
// cada uma tem um significado econômico distinto:
//
//   1. INCENTIVO  — desconto para ele pagar AGORA o resto. A venda foi boa, só
//                   rendeu menos. É redução de receita, e é do mês do desconto.
//   2. PERDA      — dívida velha, devedor não responde mais. O dinheiro não existe.
//                   É despesa (crédito incobrável), no mês em que se desiste.
//   3. ARREDONDAMENTO — diferença de centavos para fechar a conta.
//
// Antes o motivo era texto livre e saía vazio em 252 de 252 descontos: o app não
// conseguia separar nada e engolia tudo como se fosse a mesma coisa.
//
// A classificação é por PALAVRA no texto do motivo, de propósito: aceita o texto
// antigo que já está gravado no histórico e o texto novo das opções fixas.
export type MotivoDesconto = 'incentivo' | 'perda' | 'arredondamento'

export const MOTIVOS_DESCONTO: { valor: MotivoDesconto; label: string; dica: string }[] = [
  { valor: 'incentivo', label: 'Desconto para pagar agora', dica: 'O cliente paga o resto hoje' },
  { valor: 'perda', label: 'Não vou receber mais', dica: 'Dívida antiga, devedor não responde' },
  { valor: 'arredondamento', label: 'Arredondamento', dica: 'Diferença de centavos' },
]

export const CATEGORIA_DESCONTO = 'Desconto concedido'
export const CATEGORIA_PERDA = 'Perda com fiado'

/** O motivo é perdão de dívida (crédito incobrável)? */
export function ehPerdaoDeDivida(motivo: string | null | undefined): boolean {
  const t = (motivo ?? '').trim().toLowerCase()
  if (!t) return false
  return /n[ãa]o\s*vou\s*receber|perda|perd[ãa]o|incobr|calote|nunca\s*vai\s*pagar|sumiu/.test(t)
}

/** Categoria do lançamento que registra o desconto no resultado. */
export function categoriaDoDesconto(motivo: string | null | undefined): string {
  return ehPerdaoDeDivida(motivo) ? CATEGORIA_PERDA : CATEGORIA_DESCONTO
}

/** Nome curto do motivo, para a tela e para o histórico. */
export function rotuloMotivoDesconto(motivo: string | null | undefined): string {
  const achado = MOTIVOS_DESCONTO.find((m) => m.label.toLowerCase() === (motivo ?? '').trim().toLowerCase())
  if (achado) return achado.label
  return ehPerdaoDeDivida(motivo) ? 'Não vou receber mais' : (motivo ?? '').trim() || 'Sem motivo'
}
