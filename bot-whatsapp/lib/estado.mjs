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

// Contexto do último produto oferecido (1 produto só) — pra "sim/quero/pode
// separar" virar pedido (confirma + alerta no grupo), não busca nova. Mesma validade.
const CONTEXTOS = new Map()

export function guardaContexto(loja, jid, produto) {
  CONTEXTOS.set(`${loja}:${jid}`, { produto, expiraEm: Date.now() + VALIDADE_MS })
}

export function pegaContexto(loja, jid) {
  const chave = `${loja}:${jid}`
  const c = CONTEXTOS.get(chave)
  if (!c) return null
  if (Date.now() > c.expiraEm) { CONTEXTOS.delete(chave); return null }
  return c.produto
}

export function limpaContexto(loja, jid) {
  CONTEXTOS.delete(`${loja}:${jid}`)
}

// Último TIPO de peça da conversa ("frontal", "tela", "bateria"...) — pra quando
// o cliente muda só o modelo ("iphone 12" após "frontal iphone 11") e o bot
// continua o tipo em vez de chutar qualquer peça. Mesma validade do contexto.
const CATEGORIAS = new Map()

export function guardaCategoria(loja, jid, cat) {
  if (!cat) return
  CATEGORIAS.set(`${loja}:${jid}`, { cat, expiraEm: Date.now() + VALIDADE_MS })
}

export function pegaCategoria(loja, jid) {
  const chave = `${loja}:${jid}`
  const c = CATEGORIAS.get(chave)
  if (!c) return null
  if (Date.now() > c.expiraEm) { CATEGORIAS.delete(chave); return null }
  return c.cat
}
