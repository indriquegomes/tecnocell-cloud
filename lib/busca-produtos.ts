// Busca de produto por palavra, compartilhada entre PDV, estoque, promoções,
// tabelas de preço, catálogo e produtos — todos tinham a MESMA lógica colada
// (mesmo comentário "Mesma lógica de app/painel/tabelas-preco/actions.ts"
// espalhado pelo código confirma que nunca foi uma função só).
//
// palavra puramente numérica ("8") como pedaço solto de ilike bate em
// QUALQUER produto cujo código interno contenha aquele dígito em outro lugar
// ("06618"), porque busca_norm inclui o código pra permitir busca por SKU.
// Confirmado em check-up 25/08: buscar "TAMPA IPHONE 8" no módulo Estoque
// (tela /painel/estoque/movimentar) não achava "TAMPA IPHONE 8 BRANCA" —
// mesmo bug já corrigido no robô do WhatsApp (bot-whatsapp/lib/produtos.mjs)
// em 24/08, nunca replicado pra cá. Número puro agora exige bater como
// palavra inteira (`\y...\y`, regex do Postgres), não como pedaço de texto.

export function palavrasBusca(termo: string): string[] {
  return termo
    .normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
    .replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
}

const numerica = (w: string) => /^\d+$/.test(w)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aplicaBusca<Q extends { ilike: (...a: any[]) => Q; filter: (...a: any[]) => Q }>(
  query: Q,
  coluna: string,
  palavras: string[],
): Q {
  for (const w of palavras) {
    query = numerica(w) ? query.filter(coluna, 'imatch', `\\y${w}\\y`) : query.ilike(coluna, `%${w}%`)
  }
  return query
}
