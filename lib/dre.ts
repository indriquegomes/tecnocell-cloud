// Régua do resultado do mês (DRE) — UMA fórmula para duas telas.
//
// A tela Relatórios (DRE) e o Fechamento do Mês precisam mostrar o MESMO
// resultado. Duas contas paralelas divergem com o tempo (já divergiu: a tela
// de fechamento chamava de "Lucro" o que era entrou − saiu de caixa, sem
// custo das peças e sem devolução). A conta mora aqui, pura: quem busca os
// dados passa as linhas, quem exibe usa o mesmo número.
//
// Régua (docs/mapa/regra-perda-e-devolucao.md):
//   • receita cai pela devolução SÓ quando o dinheiro/crédito voltou para o
//     cliente — `sem_reembolso` (loja ficou com o preço) não reduz receita;
//   • custo volta SÓ quando a peça voltou para o estoque (`status_produto = ok`);
//   • custo é o TRAVADO na venda (`itens_venda.custo_unitario`); venda antiga
//     sem ele cai no preço de custo do cadastro;
//   • compra de mercadoria não é despesa (o custo já entra pelo CMV na venda).

export type LinhaDre = {
  receitaBruta: number
  receitaDevolvida: number
  receitaLiquida: number
  cmvBruto: number
  custoDevolvido: number
  cmv: number
  lucroBruto: number
  despesas: number
  despesasPago: number
  despesasAberto: number
  resultado: number
}

export type ItemVendidoDre = {
  quantidade: number
  custoUnitario: number | null
  precoCusto: number | null
}

export type ItemDevolvidoDre = {
  quantidade: number
  totalItem: number
  /** peça voltou para o estoque (status_produto = ok) → devolve o custo */
  pecaVoltou: boolean
  /** dinheiro/crédito voltou ao cliente (tipo_credito != sem_reembolso) → cai a receita */
  dinheiroVoltou: boolean
  custoUnitario: number | null
  precoCusto: number | null
}

export type DespesaDre = {
  valor: number
  paga: boolean
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function montarDre(p: {
  /** vendas.total das vendas concluídas e sem uso interno do período */
  vendasTotais: number[]
  itens: ItemVendidoDre[]
  devolvido: ItemDevolvidoDre[]
  /** lançamentos de despesa do período, fora mercadoria (a mercadoria é CMV) */
  despesas: DespesaDre[]
}): LinhaDre {
  const receitaBruta = p.vendasTotais.reduce((s, v) => s + (Number(v) || 0), 0)

  // custo travado na venda; sem ele, cai no cadastro — nunca fica negativo
  const custo = (custoUnitario: number | null, precoCusto: number | null) =>
    Number(custoUnitario ?? precoCusto ?? 0) || 0

  const cmvBruto = p.itens.reduce((s, i) => s + custo(i.custoUnitario, i.precoCusto) * (Number(i.quantidade) || 0), 0)
  const receitaDevolvida = p.devolvido.reduce(
    (s, d) => s + (d.dinheiroVoltou ? Number(d.totalItem) || 0 : 0), 0)
  const custoDevolvido = p.devolvido.reduce(
    (s, d) => s + (d.pecaVoltou ? custo(d.custoUnitario, d.precoCusto) * (Number(d.quantidade) || 0) : 0), 0)

  const despesas = p.despesas.reduce((s, d) => s + (Number(d.valor) || 0), 0)
  const despesasPago = p.despesas.reduce((s, d) => s + (d.paga ? Number(d.valor) || 0 : 0), 0)

  const receitaLiquida = receitaBruta - receitaDevolvida
  const cmv = cmvBruto - custoDevolvido
  const lucroBruto = receitaLiquida - cmv
  const resultado = lucroBruto - despesas

  return {
    receitaBruta: r2(receitaBruta),
    receitaDevolvida: r2(receitaDevolvida),
    receitaLiquida: r2(receitaLiquida),
    cmvBruto: r2(cmvBruto),
    custoDevolvido: r2(custoDevolvido),
    cmv: r2(cmv),
    lucroBruto: r2(lucroBruto),
    despesas: r2(despesas),
    despesasPago: r2(despesasPago),
    despesasAberto: r2(despesas - despesasPago),
    resultado: r2(resultado),
  }
}
