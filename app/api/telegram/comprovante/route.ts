import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ============================================================================
// Webhook do bot de comprovantes Pix — roda na Vercel (sem depender de PC ligado).
// Porta TODA a lógica do ciclo do PC (scratchpad/ciclo-comprovantes.cjs):
//  - 2 LOJAS na mesma route via ?loja=petropolis|teresopolis (cada bot tem seu webhook)
//  - lê SÓ imagem/pdf/LINK (ignora texto, exceto comandos /abrir /fechar)
//  - extrai com Sonnet (valor+cliente+destinatário+CNPJ+ID) + 2ª leitura focada (valor/ID)
//  - data pelo ID E2E cruzada com quando chegou no Telegram (resolveData)
//  - "sem destinatário" = incompleto (não soma) · dedup por transacao_id (avisa 1x)
//  - agrupa por CNPJ/nome (union-find) e escreve na ABA da loja (cria se faltar)
//  - /abrir /fechar = "caixa do Pix" (o TOTAL do fechamento vem do BANCO, exato)
// O número do caixa nunca depende da planilha ao vivo — /fechar recalcula do banco.
// ============================================================================
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Loja = { slug: string; token: string; grupo: number; aba: string }
function lojaDe(slug: string): Loja | null {
  if (slug === 'petropolis')
    return { slug, token: process.env.TELEGRAM_TOKEN_PETROPOLIS || '', grupo: Number(process.env.TELEGRAM_GRUPO_PETROPOLIS || '0'), aba: 'Petrópolis' }
  if (slug === 'teresopolis')
    return { slug, token: process.env.TELEGRAM_TOKEN_TERESOPOLIS || '', grupo: Number(process.env.TELEGRAM_GRUPO_TERESOPOLIS || '0'), aba: 'Teresópolis' }
  return null
}
const SHEET_ID = process.env.COMPROVANTES_SHEET_ID || ''

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
const anthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ---------- helpers de valor/data ----------
const money = (v: number | null) => Number(v || 0).toFixed(2).replace('.', ',')
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

// data do Pix EMBUTIDA no ID E2E (E + ISPB8 + AAAAMMDD + HHMM + random) — 100% confiável
function dataDoId(id: string | null): string | null {
  const m = String(id || '').match(/^E(\d{8})(\d{8})(\d{4})/)
  if (!m) return null
  const d = m[2], y = +d.slice(0, 4), mo = +d.slice(4, 6), da = +d.slice(6, 8)
  if (y < 2020 || y > 2035 || mo < 1 || mo > 12 || da < 1 || da > 31) return null
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8)
}
const diaDiff = (a: string | null, b: string | null) => (!a || !b ? 999 : Math.abs((+new Date(a + 'T12:00:00') - +new Date(b + 'T12:00:00')) / 86400000))
function resolveData(dataID: string | null, dataOCR: string | null, recebido: string | null): string | null {
  const rec = recebido ? String(recebido).slice(0, 10) : null
  const cands = [dataID, dataOCR].filter(Boolean) as string[]
  if (!cands.length) return rec
  let best = cands[0]
  if (rec) for (const d of cands) if (diaDiff(d, rec) < diaDiff(best, rec)) best = d
  if (rec) { const b = best.split('-'), r = rec.split('-'); if (b[1] === r[1] && b[2] === r[2] && b[0] !== r[0]) return rec }
  return best
}
function parseValor(t: unknown): number | null {
  if (t == null) return null
  let s = String(t).replace(/r\$/i, '').replace(/[^\d.,]/g, '').trim()
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const v = parseFloat(s)
  return isNaN(v) ? null : v
}

// ---------- agrupamento por destinatário (union-find: nome + CNPJ + nome-prefixo) ----------
type Comp = { id?: string; telegram_message_id?: number; destinatario: string | null; pagador: string | null; valor: number | null; data_pix: string | null; status: string | null; formato?: string | null; arquivo_file_id?: string | null; arquivo_url?: string | null; transacao_id?: string | null; recebido_em?: string | null; extraido_raw?: Record<string, unknown> | null }
const docDe = (c: Comp) => { const d = String((c.extraido_raw as { destinatario_doc?: string } | null)?.destinatario_doc || '').replace(/\D/g, ''); return d.length === 14 ? d : '' }
const normNome = (s: string | null) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
function agrupaPorDestino(cs: Comp[]) {
  const list = cs || [], N = list.length
  const parent = list.map((_, i) => i)
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const uni = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  const nn = list.map((c) => normNome(c.destinatario || '')), doc = list.map((c) => docDe(c))
  const porNome: Record<string, number> = {}, porDoc: Record<string, number> = {}
  list.forEach((_, i) => { if (nn[i]) { if (porNome[nn[i]] != null) uni(i, porNome[nn[i]]); else porNome[nn[i]] = i } })
  list.forEach((_, i) => { if (doc[i]) { if (porDoc[doc[i]] != null) uni(i, porDoc[doc[i]]); else porDoc[doc[i]] = i } })
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const a = nn[i], b = nn[j]; if (a.length >= 10 && b.length >= 10 && (a.startsWith(b) || b.startsWith(a))) uni(i, j) }
  const buckets: Record<number, Comp[]> = {}
  list.forEach((c, i) => { const r = find(i); (buckets[r] = buckets[r] || []).push(c) })
  const g: Record<string, { nome: string; itens: Comp[] }> = {}
  for (const r of Object.keys(buckets)) {
    const it = buckets[+r]
    const cont: Record<string, number> = {}; let best = '', bestSc = -1
    for (const c of it) { const nome = (c.destinatario || '').trim(); if (!nome) continue; cont[nome] = (cont[nome] || 0) + 1; const sc = cont[nome] * 1000 + nome.length; if (sc > bestSc) { bestSc = sc; best = nome } }
    g[(normNome(best) || 'SEM DESTINATARIO') + '#' + r] = { nome: best || 'SEM DESTINATÁRIO', itens: it }
  }
  return g
}
const fmtDataBR = (d: string | null) => { if (!d) return ''; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(d) }

// ---------- Telegram ----------
async function tgSend(token: string, chatId: number, text: string, replyTo?: number) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}${replyTo ? '&reply_to_message_id=' + replyTo : ''}&text=${encodeURIComponent(text)}`).catch(() => {})
}
async function tgPost(token: string, method: string, body: unknown) {
  try { return await (await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() }
  catch { return null }
}
const urlDe = (t: string) => { const m = (t || '').match(/https?:\/\/\S+/); return m ? m[0] : null }
function tipo(m: any): { f: 'foto' | 'pdf'; fid: string } | { f: 'link'; url: string } | null {
  if (m.photo && m.photo.length) return { f: 'foto', fid: m.photo[m.photo.length - 1].file_id }
  if (m.document && (/pdf/i.test(m.document.mime_type || '') || /\.pdf$/i.test(m.document.file_name || ''))) return { f: 'pdf', fid: m.document.file_id }
  if (m.document && /^image\//i.test(m.document.mime_type || '')) return { f: 'foto', fid: m.document.file_id }
  if (m.text && urlDe(m.text)) return { f: 'link', url: urlDe(m.text)! }
  return null
}
// tipo de imagem pelos MAGIC BYTES (a extensão do Telegram às vezes mente → API dava 400)
function mediaBytes(buf: Buffer): 'image/png' | 'image/gif' | 'image/webp' | 'image/jpeg' {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) return 'image/webp'
  return 'image/jpeg'
}
async function tgFileBloco(token: string, fid: string, ehPdf: boolean): Promise<Anthropic.ContentBlockParam | null> {
  const gf = await (await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fid}`)).json()
  if (!gf.ok) return null
  const buf = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${token}/${gf.result.file_path}`)).arrayBuffer())
  const b64 = buf.toString('base64')
  return ehPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaBytes(buf), data: b64 } }
}
function stripHtml(s: string) { return s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 7000) }
async function blocoDeLink(url: string): Promise<Anthropic.ContentBlockParam | null> {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } })
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    if (ct.includes('text/html') || ct.includes('application/json')) { const t = stripHtml(await r.text()); return t.length > 20 ? { type: 'text', text: 'Conteúdo da página do comprovante (via link):\n' + t } : null }
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf[0] === 0x25 && buf[1] === 0x50) return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
    if (buf[0] === 0x89 || buf[0] === 0x47 || buf[0] === 0x52 || buf[0] === 0xFF) return { type: 'image', source: { type: 'base64', media_type: mediaBytes(buf), data: buf.toString('base64') } }
    const t = stripHtml(buf.toString('utf8')); return t.length > 20 ? { type: 'text', text: 'Conteúdo da página do comprovante (via link):\n' + t } : null
  } catch { return null }
}

const PROMPT = `Comprovante de PIX brasileiro. Leia com ATENÇÃO especial ao VALOR (confira cada dígito). Responda APENAS JSON: {"eh_comprovante": <true; false se NÃO for comprovante de Pix (conversa, foto aleatória)>, "valor": <número em reais, ex 259.00>, "data": "<AAAA-MM-DD>", "cliente": "<quem ENVIOU / 'De'>", "destinatario": "<quem RECEBEU / 'Para'>", "destinatario_doc": "<CPF/CNPJ do recebedor, só dígitos>", "transacao_id": "<ID da transação / E2E, copie EXATO>"}. Campo ausente = null.`

// extrai UM comprovante (Sonnet + 2ª leitura focada em valor/ID). Atualiza a linha no banco.
async function extraiUm(loja: Loja, c: Comp) {
  const ai = anthropic()
  let bloco: Anthropic.ContentBlockParam | null = null
  if (c.formato === 'link') { if (!c.arquivo_url) return; bloco = await blocoDeLink(c.arquivo_url) }
  else if (c.arquivo_file_id) bloco = await tgFileBloco(loja.token, c.arquivo_file_id, c.formato === 'pdf')
  if (!bloco) return
  const resp = await ai.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 400, messages: [{ role: 'user', content: [bloco, { type: 'text', text: PROMPT }] }] })
  const raw = resp.content.find((b) => b.type === 'text') as { text: string } | undefined
  const txt = (raw?.text || '').replace(/```json?/g, '').replace(/```/g, '').trim()
  let j: any
  try { j = JSON.parse(txt) } catch { return }
  const supa = sb()
  if (j.eh_comprovante === false) { await supa.from('comprovantes_pix').update({ status: 'nao_comprovante', extraido_raw: j }).eq('id', c.id); return }
  // 2ª leitura focada nos 2 campos que mais erram
  try {
    const rr = await ai.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 120, messages: [{ role: 'user', content: [bloco, { type: 'text', text: 'Leia com atenção MÁXIMA só isto deste comprovante Pix. JSON: {"valor":<número>,"transacao_id":"<ID da transação/E2E, EXATO caractere por caractere>"}' }] }] })
    const rr2 = rr.content.find((b) => b.type === 'text') as { text: string } | undefined
    const jj = JSON.parse((rr2?.text || '').replace(/```json?/g, '').replace(/```/g, '').trim())
    const v2 = parseValor(jj.valor)
    if (v2 != null && j.valor == null) j.valor = v2
    else if (v2 != null && j.valor != null && Math.abs(v2 - Number(j.valor)) > 0.01) { j.valor_incerto = true; j.valor_leitura2 = v2 }
    if (jj.transacao_id && dataDoId(jj.transacao_id) && !dataDoId(j.transacao_id)) j.transacao_id = jj.transacao_id
  } catch { /* leitura 2 é best-effort */ }
  const semDest = !j.destinatario || !String(j.destinatario).trim()
  const rec = c.recebido_em ? String(c.recebido_em).slice(0, 10) : null
  const dataFinal = resolveData(dataDoId(j.transacao_id), j.data, rec)
  const status = semDest ? 'incompleto' : (dataFinal && rec && diaDiff(dataFinal, rec) > 2 ? 'data_divergente' : 'extraido')
  await supa.from('comprovantes_pix').update({ valor: j.valor, data_pix: dataFinal, pagador: j.cliente || null, destinatario: j.destinatario || null, transacao_id: j.transacao_id || null, status, extraido_raw: j }).eq('id', c.id)
}

// processa os pendentes (o recém-chegado + até `limite` outros que faltaram) — drena buracos
async function extraiPendentes(loja: Loja, limite = 8) {
  const { data } = await sb().from('comprovantes_pix').select('*')
    .in('formato', ['foto', 'pdf', 'link']).eq('telegram_chat_id', loja.grupo)
    .neq('status', 'nao_comprovante').neq('status', 'incompleto')
    .or('valor.is.null,destinatario.is.null,transacao_id.is.null')
    .order('recebido_em').limit(limite)
  for (const c of (data || []) as Comp[]) { try { await extraiUm(loja, c) } catch { /* segue */ } }
}

// DEDUP por transacao_id: 1º (menor message_id) vale, resto = duplicado. Avisa 1x por transação.
async function deduplica(loja: Loja) {
  const supa = sb()
  const { data: cs } = await supa.from('comprovantes_pix')
    .select('id, telegram_message_id, transacao_id, data_pix, status, valor, pagador, destinatario, extraido_raw, recebido_em')
    .eq('telegram_chat_id', loja.grupo)
  const grupos: Record<string, Comp[]> = {}
  for (const c of (cs || []) as Comp[]) { if (!c.transacao_id) continue; (grupos[c.transacao_id] = grupos[c.transacao_id] || []).push(c) }
  for (const id in grupos) {
    const arr = grupos[id].sort((a, b) => (a.telegram_message_id || 0) - (b.telegram_message_id || 0))
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i]
      const semDest = !c.destinatario || !String(c.destinatario).trim()
      const rec = c.recebido_em ? String(c.recebido_em).slice(0, 10) : null
      const dataFinal = resolveData(dataDoId(c.transacao_id!), (c.extraido_raw as { data?: string } | null)?.data || null, rec)
      const deveria = i > 0 ? 'duplicado' : (semDest ? 'incompleto' : (dataFinal && rec && diaDiff(dataFinal, rec) > 2 ? 'data_divergente' : 'extraido'))
      if (c.status !== deveria || c.data_pix !== dataFinal) await supa.from('comprovantes_pix').update({ status: deveria, data_pix: dataFinal }).eq('id', c.id)
    }
    if (arr.length > 1) {
      const jaAvisou = arr.some((c) => (c.extraido_raw as { dup_avisado?: boolean } | null)?.dup_avisado)
      if (!jaAvisou) {
        const orig = arr[0], ult = arr[arr.length - 1]
        const txt = '⚠️ COMPROVANTE JÁ ENVIADO (DUPLICADO NO CAIXA)\n'
          + (ult.pagador ? 'De: ' + ult.pagador + '\n' : '')
          + (ult.destinatario ? 'Para: ' + ult.destinatario + '\n' : '')
          + (ult.valor != null ? 'Valor: R$ ' + money(ult.valor) + '\n' : '')
          + 'Esse Pix (ID ' + id + ') já foi lançado. NÃO conta de novo e não vai no fechamento.'
        await tgSend(loja.token, loja.grupo, txt, ult.telegram_message_id)
        await supa.from('comprovantes_pix').update({ extraido_raw: { ...((orig.extraido_raw as object) || {}), dup_avisado: true } }).eq('id', orig.id)
      }
    }
  }
}

// ---------- Google Sheets via REST (JWT do service account) ----------
function b64url(buf: Buffer | string) { return Buffer.from(buf).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_') }
async function googleToken(): Promise<string> {
  const sa = JSON.parse(process.env.GOOGLE_SA_JSON || '{}')
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SA_JSON ausente/incompleto')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const input = `${header}.${claim}`
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key)
  const jwt = `${input}.${b64url(sig)}`
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })
  const j = await r.json()
  if (!j.access_token) throw new Error('google token: ' + JSON.stringify(j).slice(0, 120))
  return j.access_token
}
const gh = (token: string) => ({ Authorization: 'Bearer ' + token })
// garante a ABA por nome (cria se faltar) → retorna sheetId
async function garanteAba(token: string, aba: string): Promise<number> {
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(title,sheetId)`, { headers: gh(token) })).json()
  const found = (meta.sheets || []).find((s: any) => s.properties?.title === aba)
  if (found) return found.properties.sheetId
  const add = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, { method: 'POST', headers: { ...gh(token), 'content-type': 'application/json' }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: aba } } }] }) })).json()
  return add.replies[0].addSheet.properties.sheetId
}
async function periodoAberto(grupo: number) {
  const { data } = await sb().from('pix_periodos').select('*').eq('telegram_chat_id', grupo).is('fechado_em', null).order('aberto_em', { ascending: false }).limit(1)
  return data && data[0]
}
async function escreveSheet(loja: Loja) {
  const token = await googleToken()
  const sheetId = await garanteAba(token, loja.aba)
  const per = await periodoAberto(loja.grupo)
  let q = sb().from('comprovantes_pix').select('*').eq('telegram_chat_id', loja.grupo).neq('status', 'nao_comprovante')
  if (per) q = q.gte('recebido_em', per.aberto_em)
  const { data: cs } = await q.order('recebido_em')
  const groups = agrupaPorDestino((cs || []) as Comp[])

  const linhas: (string | number)[][] = [['Destinatário', 'Cliente', 'Valor (R$)', 'Data', 'Observação']]
  const rowTypes: string[] = ['header']
  let geral = 0, dups = 0, validos = 0, incompletos = 0
  for (const k of Object.keys(groups).sort()) {
    const g = groups[k]; let soma = 0, nImg = 0
    for (const c of g.itens) {
      const v = Number(c.valor) || 0
      let obs = '', tp = 'dado'
      if (c.status === 'duplicado') { obs = '🔁 duplicado — não somado'; dups++; tp = 'dup' }
      else if (c.status === 'incompleto') { obs = '❗ sem destinatário — não somado'; incompletos++; tp = 'incompleto' }
      else {
        soma += v; geral += v; validos++; nImg++
        const er = c.extraido_raw as { valor_incerto?: boolean; valor_leitura2?: number } | null
        if (er?.valor_incerto) { obs = '⚠️ confere valor (leu R$' + money(v) + ' / R$' + money(er.valor_leitura2 || 0) + ')'; tp = 'alerta' }
        else if (c.status === 'data_divergente') { obs = '⚠️ data ≠ hoje'; tp = 'alerta' }
        else if (c.valor == null) { obs = '⚠️ não lido'; tp = 'alerta' }
      }
      linhas.push([g.nome, c.pagador || '—', c.valor != null ? v : '', fmtDataBR(c.data_pix), obs]); rowTypes.push(tp)
    }
    linhas.push(['', 'TOTAL ' + g.nome, soma, nImg + (nImg === 1 ? ' imagem' : ' imagens'), '']); rowTypes.push('subtotal')
    linhas.push(['', '', '', '', '']); rowTypes.push('blank')
  }
  const notas = [validos + ' comprovantes']
  if (dups) notas.push(dups + ' duplicado' + (dups > 1 ? 's' : ''))
  if (incompletos) notas.push(incompletos + ' incompleto' + (incompletos > 1 ? 's' : ''))
  linhas.push(['', 'TOTAL GERAL', geral, '', notas.join(' · ')]); rowTypes.push('total')

  const R = (t: string) => encodeURIComponent(`${t}!A1:Z2000`)
  const RA1 = (t: string) => encodeURIComponent(`${t}!A1`)
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${R(loja.aba)}:clear`, { method: 'POST', headers: gh(token) })
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RA1(loja.aba)}?valueInputOption=RAW`, { method: 'PUT', headers: { ...gh(token), 'content-type': 'application/json' }, body: JSON.stringify({ values: linhas }) })

  // DESIGN (marca TecnoCell #1B6CA8)
  const AZUL = { red: 0.106, green: 0.424, blue: 0.659 }, BRANCO = { red: 1, green: 1, blue: 1 }
  const CINZA = { red: 0.93, green: 0.95, blue: 0.97 }, AMBAR = { red: 0.72, green: 0.45, blue: 0.05 }, CINZATX = { red: 0.55, green: 0.55, blue: 0.55 }
  const nRows = linhas.length, nCols = 5
  const rowFmt = (r: number, fmt: object, fields: string) => ({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: fmt }, fields } })
  const reqs: object[] = []
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 2000, startColumnIndex: 0, endColumnIndex: 26 }, cell: {}, fields: 'userEnteredFormat' } })
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: nRows, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: { textFormat: { fontSize: 10 }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,verticalAlignment)' } })
  reqs.push(rowFmt(0, { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: BRANCO, fontSize: 11 }, horizontalAlignment: 'CENTER' }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'))
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } })
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: nRows, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '"R$" #,##0.00' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: nRows, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } })
  rowTypes.forEach((t, i) => {
    if (i === 0) return
    if (t === 'subtotal') reqs.push(rowFmt(i, { backgroundColor: CINZA, textFormat: { bold: true } }, 'userEnteredFormat(backgroundColor,textFormat)'))
    else if (t === 'total') reqs.push(rowFmt(i, { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: BRANCO, fontSize: 11 } }, 'userEnteredFormat(backgroundColor,textFormat)'))
    else if (t === 'dup') reqs.push(rowFmt(i, { textFormat: { foregroundColor: CINZATX, italic: true } }, 'userEnteredFormat.textFormat'))
    else if (t === 'incompleto') reqs.push(rowFmt(i, { textFormat: { foregroundColor: AMBAR, italic: true } }, 'userEnteredFormat.textFormat'))
    else if (t === 'alerta') reqs.push(rowFmt(i, { textFormat: { foregroundColor: AMBAR } }, 'userEnteredFormat.textFormat'))
  })
  const w = (c: number, px: number) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  reqs.push(w(0, 250), w(1, 220), w(2, 120), w(3, 110), w(4, 270))
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, { method: 'POST', headers: { ...gh(token), 'content-type': 'application/json' }, body: JSON.stringify({ requests: reqs }) }).catch(() => {})
  return { n: validos, soma: geral, dups }
}

// ---------- /abrir e /fechar ----------
async function abrir(loja: Loja, quem: string | null) {
  const p = await periodoAberto(loja.grupo)
  if (p) { await tgSend(loja.token, loja.grupo, '⚠️ Já tem uma contagem ABERTA desde ' + new Date(p.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '. Use /fechar antes de abrir outra.'); return }
  await sb().from('pix_periodos').insert({ id: crypto.randomUUID(), telegram_chat_id: loja.grupo, aberto_em: new Date().toISOString(), aberto_por: quem || null })
  await tgSend(loja.token, loja.grupo, '✅ Contagem do Pix ABERTA' + (quem ? ' por ' + quem : '') + '. Pode mandar os comprovantes.')
}
async function fechar(loja: Loja, p: any, quem: string | null) {
  const { data: cs } = await sb().from('comprovantes_pix').select('*').eq('telegram_chat_id', loja.grupo).gte('recebido_em', p.aberto_em).neq('status', 'duplicado').neq('status', 'nao_comprovante').neq('status', 'incompleto').order('recebido_em')
  const groups = agrupaPorDestino((cs || []) as Comp[]); const keys = Object.keys(groups).sort()
  let geral = 0, resumo = '📊 FECHAMENTO DO PIX' + (quem ? ' — ' + quem : '') + '\n'
  resumo += '(' + new Date(p.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) + ' → agora)\n\n'
  for (const k of keys) { const g = groups[k]; const soma = g.itens.reduce((s, c) => s + (Number(c.valor) || 0), 0); geral += soma; resumo += '• ' + g.itens.length + ' imagens — ' + g.nome + ' — R$ ' + money(soma) + '\n' }
  resumo += '\n💰 TOTAL: R$ ' + money(geral) + ' · ' + (cs || []).length + ' comprovantes'
  await tgSend(loja.token, loja.grupo, resumo)
  // marca fechado ANTES das imagens (garante o registro mesmo se o reenvio estourar o tempo)
  await sb().from('pix_periodos').update({ fechado_em: new Date().toISOString(), fechado_por: quem || null }).eq('id', p.id)
  // reenvia as imagens agrupadas (best-effort)
  for (const k of keys) {
    const g = groups[k]; const soma = g.itens.reduce((s, c) => s + (Number(c.valor) || 0), 0)
    await tgSend(loja.token, loja.grupo, '📎 ' + g.nome + ' — ' + g.itens.length + ' comprovantes — R$ ' + money(soma))
    const fotos = g.itens.filter((c) => c.formato === 'foto').map((c) => c.arquivo_file_id)
    for (let i = 0; i < fotos.length; i += 10) await tgPost(loja.token, 'sendMediaGroup', { chat_id: loja.grupo, media: fotos.slice(i, i + 10).map((f) => ({ type: 'photo', media: f })) })
    for (const c of g.itens.filter((x) => x.formato === 'pdf')) await tgPost(loja.token, 'sendDocument', { chat_id: loja.grupo, document: c.arquivo_file_id })
    for (const c of g.itens.filter((x) => x.formato === 'link' && x.arquivo_url)) await tgSend(loja.token, loja.grupo, '🔗 ' + c.arquivo_url)
  }
}

// ---------- pipeline de uma mensagem ----------
async function processa(loja: Loja, update: any) {
  const m = update.message || update.channel_post
  if (!m || !m.chat || m.chat.id !== loja.grupo) return
  const txt = (m.text || '').trim().toLowerCase()
  const quem = m.from ? ((m.from.first_name || '') + (m.from.last_name ? ' ' + m.from.last_name : '')).trim() : null
  if (txt.startsWith('/abrir')) { await abrir(loja, quem); await escreveSheet(loja); return }
  if (txt.startsWith('/fechar')) { const p = await periodoAberto(loja.grupo); if (p) await fechar(loja, p, quem); else await tgSend(loja.token, loja.grupo, 'ℹ️ Não há contagem aberta. Use /abrir primeiro.'); await escreveSheet(loja); return }

  const t = tipo(m)
  if (!t) return // texto puro sem url = ignora
  await sb().from('comprovantes_pix').upsert({
    telegram_chat_id: loja.grupo, telegram_message_id: m.message_id, recebido_em: new Date((m.date || 0) * 1000).toISOString(),
    formato: t.f, arquivo_file_id: 'fid' in t ? t.fid : null, arquivo_url: 'url' in t ? t.url : null, status: 'recebido',
  }, { onConflict: 'telegram_chat_id,telegram_message_id' })

  await extraiPendentes(loja)
  await deduplica(loja)
  await escreveSheet(loja)
}

export async function POST(req: Request) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) return new NextResponse('forbidden', { status: 401 })
  const loja = lojaDe(new URL(req.url).searchParams.get('loja') || '')
  if (!loja || !loja.token || !loja.grupo) return NextResponse.json({ ok: true }) // loja desconhecida/sem config — ignora
  let update: unknown
  try { update = await req.json() } catch { return NextResponse.json({ ok: true }) }
  try { await processa(loja, update) } catch (e) { console.error('comprovante webhook:', e) }
  return NextResponse.json({ ok: true }) // sempre 200 — evita retry-storm do Telegram
}
