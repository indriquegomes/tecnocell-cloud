/**
 * ESTORNO DO ABATIMENTO NA NOTA — a volta do "Pago" de compra de mercadoria.
 *
 * O botão "Pago" do Financeiro encolhe a nota do fornecedor (`abaterNaDivida`), mas
 * "Desfazer" só devolvia o lançamento para pendente. Resultado: o valor voltava como
 * dívida e o abatimento continuava na nota — a dívida do fornecedor ficava maior que a
 * planilha, e o mesmo dinheiro era contado duas vezes (uma como nota menor, outra como
 * pagamento desfeito).
 *
 * Para poder desfazer, cada abatimento gravado no histórico carrega o id do lançamento
 * que o gerou (`lancamento_id`). Aqui a conta é PURA: recebe a nota e o id, devolve como
 * a nota fica. Sem banco, sem UI — por isso tem teste próprio (`test/estorno.test.ts`).
 *
 * Abatimento feito antes de existir o `lancamento_id` não é estornável por aqui: a
 * função devolve null e quem chamou avisa para conferir na mão. Chutar o valor de volta
 * seria pior do que não mexer.
 */

export type ItemHistorico = {
  valor?: number | null
  forma?: string | null
  data?: string | null
  lancamento_id?: string | null
}

export type PlanoEstorno = {
  /** soma que volta para a nota */
  abatido: number
  /** valor da nota depois do estorno */
  novoValor: number
  /** status depois do estorno — nota estornada volta a ser cobrável */
  novoStatus: 'pendente'
  /** histórico sem as linhas desta baixa */
  novoHistorico: ItemHistorico[]
  /** descrição sem os "(abateu X de ...)" desta baixa */
  novaDescricao: string
}

const arred = (v: number) => Math.round(v * 100) / 100
const reais = (v: number) => v.toFixed(2).replace('.', ',')

export function planejarEstornoNota({
  valor,
  descricao,
  historico,
  lancamentoId,
}: {
  valor: number | null
  descricao: string | null
  historico: unknown
  lancamentoId: string
}): PlanoEstorno | null {
  const id = String(lancamentoId ?? '').trim()
  if (!id) return null
  const itens: ItemHistorico[] = Array.isArray(historico) ? (historico as ItemHistorico[]) : []
  const meus = itens.filter((h) => String(h?.lancamento_id ?? '') === id)
  if (!meus.length) return null

  const abatido = arred(meus.reduce((s, h) => s + Number(h?.valor ?? 0), 0))
  const valorAtual = Number.isFinite(Number(valor)) ? Number(valor) : 0

  // Tira da descrição só os pedaços desta baixa. O abatimento escreve sempre
  // " (abateu <valor> de <rótulo>)", então cada item do histórico tem o seu par.
  let novaDescricao = String(descricao ?? '')
  for (const h of meus) {
    const v = Number(h?.valor ?? 0)
    const padrao = new RegExp(`\\s*\\(abateu ${reais(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} de [^)]*\\)`, 'gi')
    novaDescricao = novaDescricao.replace(padrao, '')
  }

  return {
    abatido,
    novoValor: arred(valorAtual + abatido),
    novoStatus: 'pendente',
    novoHistorico: itens.filter((h) => String(h?.lancamento_id ?? '') !== id),
    novaDescricao: novaDescricao.trim(),
  }
}
