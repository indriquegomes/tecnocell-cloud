// Memória de curto prazo: última lista de produtos ambígua oferecida numa
// conversa, só pra "1", "a segunda", "esse aí" etc. funcionarem como
// resposta ao invés de virar uma busca nova do zero. Em memória (Map), não
// no banco — não é dado de negócio, é só uma pista de conversa; perder isso
// num restart do processo não tem problema nenhum.
const PENDENTES = new Map()
const VALIDADE_MS = 10 * 60 * 1000 // 10 min — depois disso trata como pergunta nova

export function guardaPendente(loja, jid, produtos) {
  PENDENTES.set(`${loja}:${jid}`, { produtos, expiraEm: Date.now() + VALIDADE_MS })
}

export function pegaPendente(loja, jid) {
  const chave = `${loja}:${jid}`
  const p = PENDENTES.get(chave)
  if (!p) return null
  if (Date.now() > p.expiraEm) { PENDENTES.delete(chave); return null }
  return p.produtos
}

export function limpaPendente(loja, jid) {
  PENDENTES.delete(`${loja}:${jid}`)
}
