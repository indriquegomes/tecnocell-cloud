// Telegram por LONG POLLING (getUpdates). Rodando local não existe URL pública pra
// webhook — e polling ainda resolve dois problemas do webhook: nada se perde quando o
// processo cai (o offset só avança depois de processar) e não tem retry-storm.
const API = (token, m) => `https://api.telegram.org/bot${token}/${m}`

export const fetchT = (url, opts = {}, ms = 15000) => fetch(url, { ...opts, signal: AbortSignal.timeout(ms) })

const dorme = (ms) => new Promise((r) => setTimeout(r, ms))

// Toda chamada respeita o flood-control: o Telegram responde 429 com `retry_after` e o
// bot antigo simplesmente perdia a mensagem (o erro ia pro vazio).
async function chama(token, metodo, body, ms = 15000, tentativa = 0, silencioso = false) {
  let j
  try {
    const r = await fetchT(API(token, metodo), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, ms)
    j = await r.json()
  } catch (e) {
    j = { ok: false, erro: String(e?.message || e) }
  }
  if (!j?.ok && j?.parameters?.retry_after && tentativa < 2) {
    const espera = Math.min(Number(j.parameters.retry_after) + 1, 60)
    console.error(`[tg] flood-control em ${metodo}: esperando ${espera}s`)
    await dorme(espera * 1000)
    return chama(token, metodo, body, ms, tentativa + 1, silencioso)
  }
  if (!j?.ok && !silencioso) console.error(`[tg] ${metodo} falhou:`, j?.description || j?.erro || JSON.stringify(j).slice(0, 120))
  return j
}

const LIMITE_TEXTO = 3900 // o Telegram corta em 4096; margem pra emoji contar dobrado

// Resumo de fechamento com muitos destinatários passa de 4096 e o Telegram RECUSA a
// mensagem inteira — o fechamento simplesmente não aparecia no grupo. Quebra em pedaços.
export function fatia(text) {
  if (text.length <= LIMITE_TEXTO) return [text]
  const partes = []
  let resto = text
  while (resto.length > LIMITE_TEXTO) {
    let corte = resto.lastIndexOf('\n', LIMITE_TEXTO)
    if (corte < LIMITE_TEXTO * 0.5) corte = LIMITE_TEXTO
    partes.push(resto.slice(0, corte))
    resto = resto.slice(corte).replace(/^\n/, '')
  }
  if (resto) partes.push(resto)
  return partes
}

export async function enviaTexto(token, chat_id, text, reply_to_message_id) {
  const partes = fatia(String(text ?? ''))
  let ultimo = null
  for (let i = 0; i < partes.length; i++) {
    ultimo = await chama(token, 'sendMessage', {
      chat_id, text: partes[i],
      ...(reply_to_message_id && i === 0 ? { reply_to_message_id, allow_sending_without_reply: true } : {}),
    })
    if (partes.length > 1 && i < partes.length - 1) await dorme(400)
  }
  return ultimo
}

// Imagem mandada COMO ARQUIVO vira 'document' no Telegram; sendPhoto recusa esse file_id.
// Tenta foto, cai pra documento.
export async function enviaFoto(token, chat_id, file_id) {
  const r = await chama(token, 'sendPhoto', { chat_id, photo: file_id }, 15000, 0, true)
  if (r?.ok) return r
  return chama(token, 'sendDocument', { chat_id, document: file_id })
}
export const enviaDoc = (token, chat_id, file_id) => chama(token, 'sendDocument', { chat_id, document: file_id })

export async function getUpdates(token, offset, timeout = 25) {
  const r = await chama(token, 'getUpdates', {
    offset, timeout, allowed_updates: ['message', 'channel_post', 'edited_message'],
  }, (timeout + 15) * 1000)
  return r
}

export const removeWebhook = (token) => chama(token, 'deleteWebhook', { drop_pending_updates: false })
export const quemSou = (token) => chama(token, 'getMe', {})

export async function baixaArquivo(token, file_id) {
  const gf = await chama(token, 'getFile', { file_id })
  if (!gf?.ok) throw new Error('getFile: ' + (gf?.description || gf?.erro || 'falhou'))
  const r = await fetchT(`https://api.telegram.org/file/bot${token}/${gf.result.file_path}`, {}, 30000)
  if (!r.ok) throw new Error('download: HTTP ' + r.status)
  return Buffer.from(await r.arrayBuffer())
}

// Que tipo de comprovante é a mensagem. Texto puro sem link = não é comprovante.
export function tipoDaMensagem(m) {
  if (m.photo?.length) return { formato: 'foto', file_id: m.photo[m.photo.length - 1].file_id }
  const doc = m.document
  if (doc && (/pdf/i.test(doc.mime_type || '') || /\.pdf$/i.test(doc.file_name || ''))) return { formato: 'pdf', file_id: doc.file_id }
  if (doc && /^image\//i.test(doc.mime_type || '')) return { formato: 'foto', file_id: doc.file_id }
  const url = (m.text || m.caption || '').match(/https?:\/\/\S+/)?.[0]
  if (url) return { formato: 'link', url }
  return null
}
