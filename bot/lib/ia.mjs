import Anthropic from '@anthropic-ai/sdk'
import { MODELO, env } from './env.mjs'
import { baixaArquivo, fetchT } from './tg.mjs'
import { parseValor, limpaId, primeiroJson, dataDoId } from './util.mjs'

const ai = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: 20000, maxRetries: 2 })

// Saúde da API: se a leitura falha em série (chave sem crédito, Anthropic fora), o bot
// PARA de tentar por uns minutos em vez de queimar a fila inteira em silêncio.
export const saude = { falhasSeguidas: 0, pausadoAte: 0, ultimoErro: '' }
export const apiPausada = () => Date.now() < saude.pausadoAte

const PROMPT = `Comprovante de PIX brasileiro. Leia com ATENÇÃO ao VALOR (cada dígito) e NÃO INVERTA quem pagou e quem recebeu:
- "cliente" = quem ENVIOU / PAGOU (rótulos: De / Origem / Pagador / Remetente / Debitado de / Conta de origem). É de quem SAIU o dinheiro.
- "destinatario" = quem RECEBEU (rótulos: Para / Destino / Recebedor / Favorecido / Beneficiário / Creditado para). É para quem o dinheiro FOI. "destinatario_doc" = CPF/CNPJ DESSE recebedor.
Responda APENAS JSON: {"eh_comprovante": <true; false se NÃO for comprovante de Pix (conversa, foto aleatória)>, "valor": <número em reais, ex 259.00>, "data": "<AAAA-MM-DD>", "cliente": "<quem ENVIOU>", "destinatario": "<quem RECEBEU>", "destinatario_doc": "<CPF/CNPJ do recebedor, só dígitos>", "transacao_id": "<ID da transação / E2E, copie EXATO>"}. Campo ausente = null.`

// A extensão que o Telegram informa às vezes mente e a API devolve 400 — decide pelos bytes.
function mediaBytes(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) return 'image/webp'
  return 'image/jpeg'
}
const stripHtml = (s) => s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 7000)

async function blocoDeLink(url) {
  const r = await fetchT(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } }, 20000)
  // Sem isso, um link fora do ar devolve a página de erro, a IA "lê" aquilo e o
  // comprovante queima tentativa até virar ilegível — quando o problema era o link.
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const ct = (r.headers.get('content-type') || '').toLowerCase()
  if (ct.includes('text/html') || ct.includes('application/json')) {
    const t = stripHtml(await r.text())
    return t.length > 20 ? { type: 'text', text: 'Conteúdo da página do comprovante (via link):\n' + t } : null
  }
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf[0] === 0x25 && buf[1] === 0x50) return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
  if (buf[0] === 0x89 || buf[0] === 0x47 || buf[0] === 0x52 || buf[0] === 0xff)
    return { type: 'image', source: { type: 'base64', media_type: mediaBytes(buf), data: buf.toString('base64') } }
  const t = stripHtml(buf.toString('utf8'))
  return t.length > 20 ? { type: 'text', text: 'Conteúdo da página do comprovante (via link):\n' + t } : null
}

async function montaBloco(loja, c) {
  if (c.formato === 'link') {
    if (!c.url) return { erro: 'sem-url', transitoria: false }
    const b = await blocoDeLink(c.url).catch((e) => ({ falha: String(e?.message || e) }))
    if (!b || b.falha) return { erro: 'link: ' + (b?.falha || 'vazio'), transitoria: true }
    return { bloco: b }
  }
  if (!c.file_id) return { erro: 'sem-arquivo', transitoria: false }
  try {
    const buf = await baixaArquivo(loja.token, c.file_id)
    // Limite da API é ~5MB por anexo; passar disso devolve 400 e vira "ilegível" sem
    // explicação nenhuma. Melhor dizer o motivo de verdade na planilha.
    if (buf.length > 4_800_000) return { erro: `arquivo grande demais (${(buf.length / 1e6).toFixed(1)}MB) — reenvie como foto`, transitoria: false }
    return {
      bloco: c.formato === 'pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
        : { type: 'image', source: { type: 'base64', media_type: mediaBytes(buf), data: buf.toString('base64') } },
    }
  } catch (e) { return { erro: 'telegram: ' + String(e?.message || e).slice(0, 80), transitoria: true } }
}

// Erro de INFRA (rede, crédito, 5xx, chave) nunca pode virar "comprovante ilegível".
function ehTransitoria(e) {
  const s = e?.status
  if (s == null) return true
  if (s === 429 || s >= 500) return true
  if (s === 401 || s === 403) return true
  if (s === 400 && /credit|balance|quota/i.test(String(e?.message || ''))) return true
  return false
}

async function pergunta(bloco, texto, max_tokens) {
  const r = await ai.messages.create({ model: MODELO, max_tokens, messages: [{ role: 'user', content: [bloco, { type: 'text', text: texto }] }] })
  return primeiroJson(r.content.find((b) => b.type === 'text')?.text || '')
}

/**
 * Lê UM comprovante. Devolve {ok:true, dados} ou {ok:false, motivo, transitoria}.
 * Duas leituras + uma terceira só do valor quando as duas discordam (best-of-3).
 */
export async function leComprovante(loja, c) {
  if (apiPausada()) return { ok: false, motivo: 'api-pausada: ' + saude.ultimoErro, transitoria: true }
  const m = await montaBloco(loja, c)
  if (m.erro) return { ok: false, motivo: m.erro, transitoria: !!m.transitoria }
  const bloco = m.bloco

  let j
  try {
    j = await pergunta(bloco, PROMPT, 400)
    // leu: a API voltou. Limpar o último erro evita o fechamento culpar um problema
    // que já passou ("Motivo: 400 credit balance" horas depois de recarregar).
    saude.falhasSeguidas = 0
    saude.ultimoErro = ''
    saude.pausadoAte = 0
  } catch (e) {
    const t = ehTransitoria(e)
    if (t) {
      saude.falhasSeguidas++
      saude.ultimoErro = `${e?.status || 'rede'} ${String(e?.message || e).slice(0, 90)}`
      if (saude.falhasSeguidas >= 3) {
        saude.pausadoAte = Date.now() + 5 * 60 * 1000
        console.error('[ia] 3 falhas seguidas — pausando leitura por 5min:', saude.ultimoErro)
      }
    }
    return { ok: false, motivo: 'api: ' + String(e?.status || '') + ' ' + String(e?.message || e).slice(0, 100), transitoria: t }
  }
  if (!j) return { ok: false, motivo: 'json-fail', transitoria: false }

  j.transacao_id = limpaId(j.transacao_id)
  j.valor = parseValor(j.valor)
  if (j.eh_comprovante === false) return { ok: true, dados: { eh_comprovante: false, raw: j } }

  let valor_incerto = false, valor_leitura2 = null, valor_leitura3 = null
  try {
    const jj = (await pergunta(bloco, 'Leia com atenção MÁXIMA só isto deste comprovante Pix. JSON: {"valor":<número>,"transacao_id":"<ID da transação/E2E, EXATO caractere por caractere>"}', 120)) || {}
    jj.transacao_id = limpaId(jj.transacao_id)
    const v2 = parseValor(jj.valor)
    valor_leitura2 = v2
    if (v2 != null && j.valor == null) j.valor = v2
    else if (v2 != null && j.valor != null && Math.abs(v2 - j.valor) > 0.01) {
      const j3 = await pergunta(bloco, 'Leia com atenção MÁXIMA só o VALOR em reais deste comprovante Pix. Responda só JSON: {"valor":<número>}', 60).catch(() => null)
      const v3 = parseValor(j3?.valor)
      valor_leitura3 = v3
      if (v3 != null && Math.abs(v3 - v2) < 0.01) j.valor = v2
      else if (v3 != null && Math.abs(v3 - j.valor) < 0.01) { /* leitura 1 confirmada */ }
      else valor_incerto = true
    }
    if (jj.transacao_id && dataDoId(jj.transacao_id) && !dataDoId(j.transacao_id)) j.transacao_id = jj.transacao_id
  } catch { /* 2ª leitura é best-effort */ }

  return {
    ok: true,
    dados: {
      eh_comprovante: true,
      valor: j.valor ?? null,
      data_ocr: j.data || null,
      pagador: j.cliente || null,
      destinatario: j.destinatario || null,
      destinatario_doc: j.destinatario_doc || null,
      transacao_id: j.transacao_id || null,
      valor_incerto, valor_leitura2, valor_leitura3,
      raw: j,
    },
  }
}
