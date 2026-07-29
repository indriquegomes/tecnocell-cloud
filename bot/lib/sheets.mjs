import crypto from 'node:crypto'
import { SHEET_ID, env } from './env.mjs'
import { fetchT } from './tg.mjs'

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')

let cacheToken = { valor: '', exp: 0 }
async function googleToken() {
  if (cacheToken.valor && Date.now() < cacheToken.exp) return cacheToken.valor
  const sa = JSON.parse(env('GOOGLE_SA_JSON', '{}'))
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SA_JSON ausente/incompleto')
  // Cinto e suspensório: a chave pode chegar com \n literal dependendo de como foi
  // colada no .env. Sem newline de verdade o crypto recusa o PEM.
  const chave = String(sa.private_key).includes('\n') ? sa.private_key : String(sa.private_key).replace(/\\n/g, '\n')
  if (!chave.includes('\n')) throw new Error('private_key do Google sem quebras de linha — confira o GOOGLE_SA_JSON')
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const input = `${head}.${claim}`
  const jwt = `${input}.${b64url(crypto.createSign('RSA-SHA256').update(input).sign(chave))}`
  const r = await fetchT('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  }, 20000)
  const j = await r.json()
  if (!j.access_token) throw new Error('google token: ' + JSON.stringify(j).slice(0, 160))
  cacheToken = { valor: j.access_token, exp: Date.now() + 50 * 60 * 1000 }
  return cacheToken.valor
}
const gh = (t) => ({ Authorization: 'Bearer ' + t })

const abasConhecidas = new Map()
async function garanteAba(token, aba) {
  if (abasConhecidas.has(aba)) return abasConhecidas.get(aba)
  const meta = await (await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(title,sheetId)`, { headers: gh(token) }, 20000)).json()
  const achou = (meta.sheets || []).find((s) => s.properties?.title === aba)
  let id = achou?.properties?.sheetId
  if (id == null) {
    const add = await (await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST', headers: { ...gh(token), 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: aba } } }] }),
    }, 20000)).json()
    id = add.replies?.[0]?.addSheet?.properties?.sheetId
  }
  if (id == null) throw new Error('nao consegui a aba ' + aba)
  abasConhecidas.set(aba, id)
  return id
}

const AZUL = { red: 0.106, green: 0.424, blue: 0.659 }
const BRANCO = { red: 1, green: 1, blue: 1 }
const CINZA = { red: 0.93, green: 0.95, blue: 0.97 }
const AMBAR = { red: 0.72, green: 0.45, blue: 0.05 }
const CINZATX = { red: 0.55, green: 0.55, blue: 0.55 }

export async function escreveAba(aba, linhas, tipos, opts = {}) {
  const { colValor = 2, colCentro = 3, larguras = [250, 220, 120, 110, 290] } = opts
  const token = await googleToken()
  const sheetId = await garanteAba(token, aba)
  const nRows = linhas.length, nCols = Math.max(1, linhas[0]?.length || 5)
  const alcance = encodeURIComponent(`${aba}!A1:Z5000`)
  await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${alcance}:clear`, { method: 'POST', headers: gh(token) }, 20000)
  await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${aba}!A1`)}?valueInputOption=RAW`, {
    method: 'PUT', headers: { ...gh(token), 'content-type': 'application/json' }, body: JSON.stringify({ values: linhas }),
  }, 25000)

  const linhaFmt = (r, fmt, fields) => ({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: fmt }, fields } })
  const reqs = [
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 26 }, cell: {}, fields: 'userEnteredFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: nRows, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: { textFormat: { fontSize: 10 }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,verticalAlignment)' } },
    linhaFmt(0, { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: BRANCO, fontSize: 11 }, horizontalAlignment: 'CENTER' }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
  ]
  if (colValor != null) reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: nRows, startColumnIndex: colValor, endColumnIndex: colValor + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '"R$" #,##0.00' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  if (colCentro != null) reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: nRows, startColumnIndex: colCentro, endColumnIndex: colCentro + 1 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } })
  tipos.forEach((t, i) => {
    if (i === 0) return
    if (t === 'subtotal') reqs.push(linhaFmt(i, { backgroundColor: CINZA, textFormat: { bold: true } }, 'userEnteredFormat(backgroundColor,textFormat)'))
    else if (t === 'total') reqs.push(linhaFmt(i, { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: BRANCO, fontSize: 11 } }, 'userEnteredFormat(backgroundColor,textFormat)'))
    else if (t === 'dup') reqs.push(linhaFmt(i, { textFormat: { foregroundColor: CINZATX, italic: true } }, 'userEnteredFormat.textFormat'))
    else if (t === 'incompleto') reqs.push(linhaFmt(i, { textFormat: { foregroundColor: AMBAR, italic: true } }, 'userEnteredFormat.textFormat'))
    else if (t === 'alerta') reqs.push(linhaFmt(i, { textFormat: { foregroundColor: AMBAR } }, 'userEnteredFormat.textFormat'))
  })
  const larg = (c, px) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  larguras.forEach((px, i) => { if (i < nCols) reqs.push(larg(i, px)) })
  await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: 'POST', headers: { ...gh(token), 'content-type': 'application/json' }, body: JSON.stringify({ requests: reqs }),
  }, 25000)
}

// ESCRITA COALESCIDA. O bot antigo reescrevia a planilha inteira 2x por mensagem — numa
// rajada de fotos isso vira dezenas de clear+write concorrentes (cota do Google e planilha
// meio escrita). Aqui cada loja tem UMA escrita pendente: marca sujo, escreve uma vez.
const estado = new Map() // aba -> { sujo, escrevendo, timer, monta, falhas, promessa }
const ESPERA_MS = Number(env('BOT_SHEET_DEBOUNCE', '4000'))
const pega = (aba, monta) => {
  const e = estado.get(aba) || { sujo: false, escrevendo: false, timer: null, monta, falhas: 0, promessa: null }
  if (monta) e.monta = monta
  estado.set(aba, e)
  return e
}
const agenda = (aba, ms) => {
  const e = pega(aba)
  if (!e.timer) e.timer = setTimeout(() => { e.timer = null; flush(aba) }, ms)
}

export function agendaEscrita(aba, monta) {
  pega(aba, monta).sujo = true
  agenda(aba, ESPERA_MS)
}

async function flush(aba) {
  const e = pega(aba)
  if (!e || e.escrevendo || !e.sujo) return
  e.escrevendo = true
  e.sujo = false
  e.promessa = (async () => {
    try {
      const { linhas, tipos, opts } = e.monta()
      await escreveAba(aba, linhas, tipos, opts || {})
      e.falhas = 0
    } catch (err) {
      e.sujo = true
      e.falhas++
      abasConhecidas.delete(aba) // aba pode ter sido renomeada/apagada: refaz o lookup
      console.error(`[sheets] ${aba} (falha ${e.falhas}):`, String(err?.message || err))
    } finally {
      e.escrevendo = false
    }
  })()
  await e.promessa
  // Backoff: credencial errada não pode virar retry a cada 4s pra sempre.
  if (e.sujo) agenda(aba, Math.min(ESPERA_MS * 2 ** Math.min(e.falhas, 6), 300000))
}

// "escreve agora". Se já tem uma escrita rodando, ESPERA ela e escreve de novo — antes
// isso retornava calado e o /fechar podia deixar a planilha desatualizada.
export async function escreveJa(aba, monta) {
  const e = pega(aba, monta)
  e.sujo = true
  if (e.timer) { clearTimeout(e.timer); e.timer = null }
  if (e.escrevendo) await e.promessa.catch(() => {})
  await flush(aba)
}
