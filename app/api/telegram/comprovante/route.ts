import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// Webhook do bot de comprovantes Pix (roda na Vercel — sem depender de PC ligado).
// O Telegram faz POST aqui a cada mensagem do grupo. A gente:
//   1. Ignora texto — lê SÓ imagem/documento (spec do Vitor 24/07).
//   2. Extrai com Haiku: valor, data, CLIENTE (quem enviou) e DESTINATÁRIO (fornecedor).
//   3. Confere se a data é de hoje (senão marca divergente).
//   4. Reescreve a planilha do Google agrupada por destinatário, com total por grupo.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const T = process.env.TELEGRAM_BOT_TOKEN || ''
const GRUPO = Number(process.env.TELEGRAM_GRUPO_CHAT_ID || '0')
const SHEET_ID = process.env.COMPROVANTES_SHEET_ID || ''

const PROMPT = `Comprovante de PIX brasileiro. Extraia e responda APENAS um JSON, nada mais:
{"valor": <número em reais, ex 70.00>, "data": "<AAAA-MM-DD>", "cliente": "<quem ENVIOU: campo 'De'/origem/pagador>", "destinatario": "<quem RECEBEU: campo 'Para'/destino/favorecido>", "transacao_id": "<identificador ÚNICO da transação: 'ID da transação'/'Identificador'/'Autenticação'/código E2E (ex E1234...). Copie EXATO. Ausente = null>"}
Regras: valor é número (ponto decimal). Campo ausente = null. Não escreva texto fora do JSON.`

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function hojeSP(): string {
  // AAAA-MM-DD no fuso de São Paulo
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// tipo da mensagem: só foto e documento (imagem/pdf). Texto e resto = ignora.
function tipoDe(m: any): { f: 'foto' | 'pdf'; fid: string } | null {
  if (m.photo && m.photo.length) return { f: 'foto', fid: m.photo[m.photo.length - 1].file_id }
  if (m.document) {
    const mime = (m.document.mime_type || '').toLowerCase()
    const nome = (m.document.file_name || '').toLowerCase()
    if (mime.includes('pdf') || nome.endsWith('.pdf')) return { f: 'pdf', fid: m.document.file_id }
    if (mime.startsWith('image/')) return { f: 'foto', fid: m.document.file_id }
  }
  return null
}

async function tgFile(fid: string): Promise<{ b64: string; media: string; ehPdf: boolean }> {
  const gf = await (await fetch(`https://api.telegram.org/bot${T}/getFile?file_id=${fid}`)).json()
  if (!gf.ok) throw new Error('getFile falhou')
  const path: string = gf.result.file_path
  const buf = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${T}/${path}`)).arrayBuffer())
  const ehPdf = /\.pdf$/i.test(path)
  const media = ehPdf ? 'application/pdf' : /\.(jpg|jpeg)$/i.test(path) ? 'image/jpeg' : 'image/png'
  return { b64: buf.toString('base64'), media, ehPdf }
}

async function extrai(fid: string) {
  const { b64, media, ehPdf } = await tgFile(fid)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const bloco: Anthropic.ContentBlockParam = ehPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: media as 'image/jpeg' | 'image/png', data: b64 } }
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [{ role: 'user', content: [bloco, { type: 'text', text: PROMPT }] }],
  })
  const txt = resp.content.find((b) => b.type === 'text')?.type === 'text'
    ? (resp.content.find((b) => b.type === 'text') as { text: string }).text
    : ''
  const limpo = txt.replace(/```json?/g, '').replace(/```/g, '').trim()
  try { return JSON.parse(limpo) as { valor: number | null; data: string | null; cliente: string | null; destinatario: string | null; transacao_id: string | null } }
  catch { return null }
}

async function tgAlerta(texto: string, replyTo: number) {
  await fetch(`https://api.telegram.org/bot${T}/sendMessage?chat_id=${GRUPO}&reply_to_message_id=${replyTo}&text=${encodeURIComponent(texto)}`).catch(() => {})
}

// ---- Google Sheets via REST (JWT do service account — sem dependência googleapis) ----
function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
async function googleToken(saEmail: string, saKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = b64url(JSON.stringify({
    iss: saEmail, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const input = `${header}.${claim}`
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(saKey)
  const jwt = `${input}.${b64url(sig)}`
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error('google token: ' + JSON.stringify(j).slice(0, 120))
  return j.access_token
}

type Comp = { destinatario: string | null; pagador: string | null; valor: number | null; data_pix: string | null; status: string | null }

// planilha AGRUPADA por destinatário, com total por grupo (spec do Vitor)
function montaLinhas(comps: Comp[]): string[][] {
  const money = (v: number) => v.toFixed(2).replace('.', ',')
  const header = ['Destinatário', 'Cliente', 'Valor (R$)', 'Data', 'Obs']
  const groups: Record<string, { nome: string; itens: Comp[] }> = {}
  for (const c of comps) {
    const nome = (c.destinatario || '').trim() || 'SEM DESTINATÁRIO'
    const key = nome.toUpperCase()
    if (!groups[key]) groups[key] = { nome, itens: [] }
    groups[key].itens.push(c)
  }
  const linhas: string[][] = [header]
  let geral = 0, dups = 0, validos = 0
  for (const key of Object.keys(groups).sort()) {
    const g = groups[key]
    let soma = 0, nImg = 0
    for (const c of g.itens) {
      const v = Number(c.valor) || 0
      let obs = ''
      if (c.status === 'duplicado') { obs = '🔁 duplicado — não somado'; dups++ }
      else { soma += v; geral += v; validos++; nImg++; obs = c.status === 'data_divergente' ? '⚠️ data ≠ hoje' : c.valor == null ? '⚠️ não lido' : '' }
      linhas.push([g.nome, c.pagador || '—', c.valor != null ? money(v) : '', c.data_pix || '', obs])
    }
    linhas.push(['', `TOTAL ${g.nome}`, money(soma), `${nImg} ${nImg === 1 ? 'imagem' : 'imagens'}`, ''])
    linhas.push(['', '', '', '', ''])
  }
  linhas.push(['', 'TOTAL GERAL', money(geral), '', `${validos} comprovantes${dups ? ` · ${dups} duplicado(s) ignorado(s)` : ''}`])
  return linhas
}

async function escreveSheet(comps: Comp[]) {
  const sa = JSON.parse(process.env.GOOGLE_SA_JSON || '{}')
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SA_JSON ausente/incompleto')
  const token = await googleToken(sa.client_email, sa.private_key)
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`, { headers: { Authorization: 'Bearer ' + token } })).json()
  const title: string = meta.sheets?.[0]?.properties?.title || 'Página1'
  const rangeAll = encodeURIComponent(`${title}!A1:Z2000`)
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${rangeAll}:clear`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } })
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${title}!A1`)}?valueInputOption=RAW`, {
    method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ values: montaLinhas(comps) }),
  })
}

async function processa(update: any) {
  const m = update.message || update.channel_post
  if (!m || !m.chat || m.chat.id !== GRUPO) return
  const t = tipoDe(m)
  if (!t) return // ignora texto e qualquer coisa que não seja imagem/pdf

  const supabase = sb()
  await supabase.from('comprovantes_pix').upsert({
    telegram_chat_id: GRUPO, telegram_message_id: m.message_id,
    recebido_em: new Date((m.date || 0) * 1000).toISOString(),
    formato: t.f, arquivo_file_id: t.fid, status: 'recebido',
  }, { onConflict: 'telegram_chat_id,telegram_message_id' })

  const j = await extrai(t.fid).catch(() => null)
  if (j) {
    let status = j.data && j.data !== hojeSP() ? 'data_divergente' : 'extraido'
    let ehDup = false
    // DUPLICATA: mesmo transacao_id numa mensagem ANTERIOR = já foi enviado antes
    if (j.transacao_id) {
      const { data: ant } = await supabase.from('comprovantes_pix')
        .select('telegram_message_id').eq('telegram_chat_id', GRUPO).eq('transacao_id', j.transacao_id)
        .lt('telegram_message_id', m.message_id).limit(1)
      if (ant && ant.length) { status = 'duplicado'; ehDup = true }
    }
    await supabase.from('comprovantes_pix').update({
      valor: j.valor, data_pix: j.data || null, pagador: j.cliente || null,
      destinatario: j.destinatario || null, transacao_id: j.transacao_id || null, status, extraido_raw: j,
    }).eq('telegram_chat_id', GRUPO).eq('telegram_message_id', m.message_id)
    if (ehDup) {
      await tgAlerta(`⚠️ COMPROVANTE DUPLICADO\n${j.cliente ? 'De: ' + j.cliente + '\n' : ''}${j.destinatario ? 'Para: ' + j.destinatario + '\n' : ''}${j.valor != null ? 'Valor: R$ ' + Number(j.valor).toFixed(2).replace('.', ',') + '\n' : ''}Esse Pix (ID ${j.transacao_id}) já foi enviado antes. NÃO estou somando de novo.`, m.message_id)
    }
  } else {
    await supabase.from('comprovantes_pix').update({ status: 'erro_leitura' })
      .eq('telegram_chat_id', GRUPO).eq('telegram_message_id', m.message_id)
  }

  const { data: comps } = await supabase.from('comprovantes_pix')
    .select('destinatario, pagador, valor, data_pix, status')
    .eq('telegram_chat_id', GRUPO).order('recebido_em')
  await escreveSheet((comps || []) as Comp[])
}

export async function POST(req: Request) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new NextResponse('forbidden', { status: 401 })
  }
  let update: unknown
  try { update = await req.json() } catch { return NextResponse.json({ ok: true }) }
  try { await processa(update) } catch (e) { console.error('comprovante webhook:', e) }
  return NextResponse.json({ ok: true }) // sempre 200 — evita retry-storm do Telegram
}
