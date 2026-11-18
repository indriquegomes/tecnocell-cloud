// Leitura de nota de entrada por foto — importador "Importar nota por foto".
//
// A foto vem do celular (WhatsApp): uma página de lista de itens do fornecedor,
// cada linha com DESCRIÇÃO, (QUANTIDADE) e PREÇO. O mesmo motor de visão do bot
// do PIX é usado aqui: Gemini quando a chave existe, DeepSeek como reserva.
//
// Sem modelo de "tudo ou nada": a leitura pode falhar e devolver vazio — quem
// chama trata como "não consegui ler" e a tela pede de novo. Item sem produto
// casado continua na lista, marcado, pra pessoa escolher na tela.

export type FotoNota = { mime: string; b64: string }
export type ItemLido = { descricao: string; quantidade: number; preco: number | null }
export type { ProdutoBasico }
export type ItemCasado = ItemLido & {
  produto_id: string | null
  produto_nome: string | null
  score: number
}

// Classe da nota e famílias do catálogo vivem em `lib/nota-classes.ts`: a tela do
// importador usa a mesma régua, e aquele arquivo não tem nada de servidor.
export {
  CLASSES_NOTA, classeDoTexto, familiasDaClasse, normalizaNome, produtoNaClasse,
} from '@/lib/nota-classes'
import { classeDoTexto, familiasDaClasse, familiasDoProduto, normalizaNome, type ProdutoBasico } from '@/lib/nota-classes'

const GEMINI_MODELO = process.env.GEMINI_MODELO || 'gemini-3.8-flash'
const DEEPSEEK_MODELO = process.env.DEEPSEEK_MODELO || 'deepseek-v4-flash-vision-exp'

// Preço no formato da lista (0,00 / 0.00 / 47 / R$ 47) → número
function parsePreco(v: unknown): number | null {
  if (v == null) return null
  let s = String(v).replace(/r\$/i, '').replace(/[^\d.,]/g, '').trim()
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

const PROMPT = `Esta foto é uma página de nota de entrada / pedido de fornecedor de peças para celular (frontais, baterias etc.).
Cada linha tem a DESCRIÇÃO do produto, depois a QUANTIDADE entre parênteses e, depois, o PREÇO em reais (pode estar escrito à mão, pode faltar).
Muitas vezes o topo da página diz de que classe é a lista ("TELAS E FRONTAIS", "BATERIAS", "PELICULAS"…) — leia isso também.
Transcreva TODAS as linhas da página e responda APENAS JSON:
{"classe":"<o que o topo/cabeçalho diz que é a lista, ou null se não estiver escrito>","itens":[{"descricao":"<texto do produto SEM a quantidade e SEM o preço>","quantidade":<número inteiro>,"preco":<número em reais ou null se não existir>}]}
Copie a descrição EXATAMENTE como está escrita, inclusive números de modelo (13, A15, A055, JK, INCELL) — não corrija, não complete e não troque número por outro. Linha riscada ou cancelada: ignore. Não invente item nem preço. Se não houver item, responda {"classe":null,"itens":[]}.`

const PROMPT_TRANSCRICAO = `Transcreva TODAS as linhas desta foto de uma lista de peças (cada linha: descrição do produto, quantidade entre parênteses, preço). Não resuma, não invente. Uma linha por linha de saída, sem numeração, sem markdown.`

// ── chamada de visão ─────────────────────────────────────────────────────────

async function chamaGemini(fotos: FotoNota[], texto: string, maxTokens: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY ausente')
  const parts = [
    ...fotos.map((f) => ({ inline_data: { mime_type: f.mime, data: f.b64 } })),
    { text: texto },
  ]
  let ultimo = ''
  for (let tent = 0; tent < 2; tent++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingLevel: 'low' } },
        }),
        signal: AbortSignal.timeout(40000),
      })
      if (r.ok) {
        const j = await r.json()
        return (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('')
      }
      ultimo = 'gemini ' + r.status
      if (r.status !== 429 && r.status !== 503 && r.status < 500) break
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e)
    }
    await new Promise((res) => setTimeout(res, 800 * (tent + 1)))
  }
  throw new Error(ultimo || 'gemini falhou')
}

async function chamaDeepSeek(fotos: FotoNota[], texto: string, maxTokens: number): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_API_KEY ausente')
  const content: unknown[] = [{ type: 'text', text: texto }]
  for (const f of fotos) content.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${f.b64}` } })
  let ultimo = ''
  for (let tent = 0; tent < 2; tent++) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: DEEPSEEK_MODELO, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
        signal: AbortSignal.timeout(40000),
      })
      if (r.ok) {
        const j = await r.json()
        return ((j.choices?.[0]?.message?.content) || '').trim()
      }
      ultimo = 'deepseek ' + r.status
      if (r.status !== 429 && r.status < 500) break
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e)
    }
    await new Promise((res) => setTimeout(res, 800 * (tent + 1)))
  }
  throw new Error(ultimo || 'deepseek falhou')
}

// primeiro objeto {...} balanceado do texto (a IA às vezes indaga depois do JSON)
function primeiroJson(txt: string): unknown {
  const s = txt.indexOf('{')
  if (s < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let i = s; i < txt.length; i++) {
    const ch = txt[i]
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false }
    else if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') { if (--depth === 0) { try { return JSON.parse(txt.slice(s, i + 1)) } catch { return null } } }
  }
  return null
}

// Leitura por transcrição (reserva): tenta achar DESCRIÇÃO (n) preço por linha.
function itensDaLinha(texto: string): ItemLido[] {
  const itens: ItemLido[] = []
  for (const bruta of texto.split('\n')) {
    const l = bruta.trim()
    if (!l || /^(javascript|exemplo|nota|total)/i.test(l)) continue
    // formato "TEXTO (12) 47" ou "TEXTO (12)"
    const m = l.match(/^(.*?)\s*\((\d{1,4})\)\s*([\d.,]*)\s*$/i)
    if (!m) continue
    const desc = m[1].trim()
    const q = parseInt(m[2], 10)
    if (!desc || !(q > 0)) continue
    itens.push({ descricao: desc, quantidade: q, preco: parsePreco(m[3] || null) })
  }
  return itens
}

/**
 * Lê os itens de uma ou mais fotos da nota. Pode devolver [] (foto ilegível ou
 * sem linhas reconhecíveis) — o chamador decide o recado pro usuário. Junto vem a
 * `classe` que a própria nota declara (null quando não está escrito).
 */
export async function lerItensDasFotos(
  fotos: FotoNota[],
  classePedida?: string | null,
): Promise<{ itens: ItemLido[]; classe: string | null }> {
  if (!fotos.length) return { itens: [], classe: null }
  // 1ª tentativa: JSON estruturado direto
  const temGemini = !!process.env.GEMINI_API_KEY
  const chamar = temGemini ? chamaGemini : chamaDeepSeek
  try {
    const txt = await chamar(fotos, PROMPT, 3000)
    const j = primeiroJson(txt) as { itens?: unknown[]; classe?: unknown } | null
    const itens = (j?.itens || [])
      .map((it) => {
        const o = (it || {}) as Record<string, unknown>
        const descricao = String(o.descricao ?? '').trim()
        const quantidade = Math.round(Number(o.quantidade ?? 0))
        const preco = parsePreco(o.preco ?? null)
        return descricao && quantidade > 0 ? { descricao, quantidade, preco } : null
      })
      .filter((x): x is ItemLido => x !== null)
    if (itens.length) {
      // o que a pessoa escolheu na tela manda; o que a nota diz é a sugestão
      return { itens, classe: classePedida || classeDoTexto(String(j?.classe ?? '')) }
    }
  } catch { /* segue pro plano B */ }
  // 2ª tentativa: transcrição livre e parse linha a linha
  try {
    const txt = await chamar(fotos, PROMPT_TRANSCRICAO, 3000)
    return { itens: itensDaLinha(txt), classe: classePedida || null }
  } catch {
    return { itens: [], classe: classePedida || null }
  }
}

/**
 * Casa cada linha da nota com o produto do catálogo.
 *
 * REGRA QUE IMPEDE ERRO DE PEÇA: todo NÚMERO que aparece na nota tem que aparecer
 * no nome do produto, como palavra inteira. "13 INCELL JK" não pode cair em "NOTE
 * 11 … JK" só porque duas de três palavras bateram — modelo errado é peça errada.
 * Código com letra e número ("A055") casa por prefixo, e mesmo assim só como
 * palavra (senão "A11" pegaria "A115", que é outro aparelho).
 *
 * Compara palavra por palavra (antes era `includes`, e "11" casava dentro de
 * "A115"). Com a classe da nota, o universo cai de ~8 mil para algumas centenas.
 *
 * Sem produto acima do corte: devolve null de propósito. Peça errada dá prejuízo
 * silencioso; linha em branco a pessoa resolve em 2 cliques na tela.
 */
export function casarProdutos(itens: ItemLido[], produtos: ProdutoBasico[], classe?: string | null): ItemCasado[] {
  const familias = familiasDaClasse(classe)
  const todos = produtos.map((p) => ({ p, nn: normalizaNome(p.nome) }))
  const filtrados = familias
    ? todos.filter(({ p }) => {
      const fams = familiasDoProduto(p)
      return familias.some((f) => fams.has(f))
    })
    : todos
  // classe que não achou nada no catálogo não pode zerar tudo: cai no catálogo inteiro
  const pool = filtrados.length ? filtrados : todos

  return itens.map((it) => {
    const toksItem = normalizaNome(it.descricao).split(' ').filter(Boolean)
    // números de modelo são obrigatórios (1 dígito também conta: "NOTE 9")
    const numeros = toksItem.filter((t) => /^\d+$/.test(t))
    const palavras = toksItem.filter((t) => t.length > 1 && !/^\d+$/.test(t))
    let best: ProdutoBasico | null = null
    let bestScore = 0
    let bestSobra = Infinity

    if (palavras.length || numeros.length) {
      for (const { p, nn } of pool) {
        const toksProd = nn.split(' ')
        const setProd = new Set(toksProd)
        // 1) todo número da nota precisa existir no produto (palavra inteira)
        if (numeros.some((n) => !setProd.has(n))) continue
        // 2) cobertura das palavras da nota
        let hit = numeros.length
        for (const t of palavras) {
          if (setProd.has(t) || toksProd.some((tp) => /[A-Z]/.test(t) && /[A-Z]/.test(tp) && tp.startsWith(t))) hit++
        }
        const score = hit / (numeros.length + palavras.length)
        // 3) empate: fica o nome mais próximo (menos palavra sobrando)
        const sobra = toksProd.length - hit
        if (score > bestScore || (score === bestScore && score > 0 && sobra < bestSobra)) {
          bestScore = score
          best = p
          bestSobra = sobra
        }
      }
    }
    const aceita = bestScore >= 0.6
    return {
      ...it,
      produto_id: aceita && best ? best.id : null,
      produto_nome: aceita && best ? best.nome : null,
      score: Math.round(bestScore * 100) / 100,
    }
  })
}
