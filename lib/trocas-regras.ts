/**
 * Regras PURAS da troca com fornecedor (sem banco, sem UI — dá para testar).
 *
 * Decidir se a diferença de valor entre a peça que saiu e a que voltou vira perda.
 * O fornecedor às vezes manda modelo equivalente um pouco mais barato: tratar
 * centavo de diferença como perda enche a tela de falso positivo e esconde a
 * perda de verdade. Por isso existe a TOLERÂNCIA (configuração do dono).
 */

export type DecisaoPerda = {
  /** valor que vira perda do mês; 0 = não é perda */
  perda: number
  /** diferença bruta (positiva = voltou mais barato) */
  diferenca: number
  /** texto para a coluna observação da troca; null = não escreve nada */
  observacao: string | null
}

const arred = (v: number) => Math.round(v * 100) / 100
const reais = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')

export function decidirPerdaRetorno({
  custoOriginal,
  custoRetorno,
  quantidade,
  tolerancia,
  ehSubstituta,
}: {
  custoOriginal: number
  custoRetorno: number
  quantidade: number
  tolerancia: number
  ehSubstituta: boolean
}): DecisaoPerda {
  const qtd = Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1
  const original = Number.isFinite(custoOriginal) ? custoOriginal : 0
  const retorno = Number.isFinite(custoRetorno) ? custoRetorno : 0
  const limite = Number.isFinite(tolerancia) && tolerancia >= 0 ? tolerancia : 0
  const diferenca = arred((original - retorno) * qtd)

  // voltou a MESMA peça: o custo é o mesmo, não há o que comparar
  if (!ehSubstituta) return { perda: 0, diferenca: 0, observacao: null }

  // voltou mais CARO: entra normal, não vira receita nem perda
  if (diferenca <= 0) {
    return {
      perda: 0,
      diferenca,
      observacao: `Peça substituta ${reais(Math.abs(diferenca))} mais cara — sem perda (não gera receita)`,
    }
  }

  // dentro da tolerância: não é perda, só fica registrado
  if (diferenca <= limite) {
    return {
      perda: 0,
      diferenca,
      observacao: `Diferença de ${reais(diferenca)} dentro da tolerância de ${reais(limite)} — sem perda`,
    }
  }

  return {
    perda: diferenca,
    diferenca,
    observacao: `Perda de ${reais(diferenca)} — peça substituta ${reais(diferenca)} mais barata (acima da tolerância de ${reais(limite)})`,
  }
}
