// O DINHEIRO DO DONO NÃO É ASSUNTO DE FUNCIONÁRIO.
//
// Pró-labore, retirada do sócio e conta particular são a vida financeira do dono.
// Quem abre o Financeiro para pagar fornecedor não tem o que fazer com essas linhas:
// elas saem da lista, dos totais, das opções de filtro e do CSV de quem não é master —
// e continuam intactas para o master.
//
// Este arquivo é só a regra (não conhece banco nem tela) para poder ser testado:
// `semODoDono` devolve a mesma consulta com o filtro colado.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const CATEGORIAS_SO_DO_MASTER = ['Pró-labore', 'Retirada do sócio', 'Particular']

// Esconde da consulta as linhas do dono. `nomesMaster` vem do cadastro de perfis
// (não é nome fixo no código): a regra é "linha ligada a quem é master".
//
// `not.in` sozinho NÃO serve: em SQL, `NOT (categoria IN (...))` é nulo quando a
// categoria é nula, e a linha "sem categoria" sumiria junto (conferido no banco:
// 7.522 linhas voltaram contra 7.523 esperadas). O mesmo vale para `pessoa_nome` —
// quase todo lançamento não tem pessoa, e todos desapareceriam. Por isso cada
// condição é escrita como `or(coluna.is.null, coluna.not.<op>)`.
//
// Vários masters exigem E entre os nomes: com OU, o segundo nome liberaria a linha do
// primeiro (vazamento silencioso do dinheiro de um sócio para o outro).
export function semODoDono(q: any, nomesMaster: string[]): any {
  const lista = `(${CATEGORIAS_SO_DO_MASTER.map((c) => `"${c}"`).join(',')})`
  const soCategoria = `or(categoria.is.null,categoria.not.in.${lista})`
  const nomes = nomesMaster.map((n) => n.replace(/[,()%\\]/g, ' ').trim()).filter(Boolean)
  if (!nomes.length) return q.or(soCategoria)
  const porNome = `and(${nomes.map((n) => `pessoa_nome.not.ilike.%${n}%`).join(',')})`
  return q.or(`and(${soCategoria},or(pessoa_nome.is.null,${porNome}))`)
}
