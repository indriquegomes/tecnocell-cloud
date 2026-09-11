import { NextResponse, after } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

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
// os 2 grupos — pra detectar o MESMO Pix postado nas DUAS lojas (contaria em dobro)
const GRUPOS = [Number(process.env.TELEGRAM_GRUPO_PETROPOLIS || 0), Number(process.env.TELEGRAM_GRUPO_TERESOPOLIS || 0)].filter(Boolean)

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
// Modelo da LEITURA do comprovante no Gemini (trocável por env GEMINI_MODELO sem deploy).
const GEMINI_MODELO = process.env.GEMINI_MODELO || 'gemini-3.8-flash'
// Quantos comprovantes atrasados o bot lê a CADA mensagem nova (além do recém-chegado).
// Era 1 (calibrado p/ Sonnet, lento) → deixava fila "não lida" acumular em rajada. Com
// Haiku (rápido) cabem vários nos 60s. Regulável por env COMPROVANTE_DRENA sem deploy.
const DRENA_POR_MSG = Number(process.env.COMPROVANTE_DRENA || 2)

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
type Comp = { id?: string; telegram_message_id?: number; destinatario: string | null; pagador: string | null; cliente_sistema?: string | null; valor: number | null; data_pix: string | null; status: string | null; formato?: string | null; arquivo_file_id?: string | null; arquivo_url?: string | null; transacao_id?: string | null; recebido_em?: string | null; extraido_raw?: Record<string, unknown> | null }
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
// fetch COM TIMEOUT. Sem isso, uma chamada travada (Google Sheets/Telegram — acontece)
// congela a função até os 60s do Vercel e a leitura do comprovante NUNCA roda (fica
// "não lido", tentativas=0). Com timeout, a chamada travada morre rápido e segue o fluxo.
const fetchT = (url: string, opts: RequestInit = {}, ms = 12000) => fetch(url, { ...opts, signal: AbortSignal.timeout(ms) })
async function tgSend(token: string, chatId: number, text: string, replyTo?: number) {
  await fetchT(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}${replyTo ? '&reply_to_message_id=' + replyTo : ''}&text=${encodeURIComponent(text)}`).catch(() => {})
}
async function tgPost(token: string, method: string, body: unknown) {
  try { return await (await fetchT(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() }
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
// ---------- Gemini: leitura de imagem (mais barato que Claude) ----------
type GPart = { inline?: { mime: string; b64: string }; text?: string }
async function geminiLe(parts: GPart[], maxTokens: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY não configurada')
  const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELO}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: parts.map((p) => p.inline
        ? { inline_data: { mime_type: p.inline.mime, data: p.inline.b64 } }
        : { text: p.text }) }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  }, 30000)
  if (!r.ok) throw new Error('gemini ' + r.status + ': ' + (await r.text()).slice(0, 200))
  const j = await r.json()
  return (j.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('')
}
// 2ª OPINIÃO independente (DeepSeek Vision) — cruza o VALOR lido pelo Gemini.
// Barato e rápido; só roda pra IMAGEM (não PDF/link). Best-effort: se falhar,
// o valor do Gemini continua valendo.
const DEEPSEEK_MODELO = process.env.DEEPSEEK_MODELO || 'deepseek-v4-flash-vision-exp'
async function deepseekLe(parte: GPart, prompt: string): Promise<string | null> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key || !parte.inline || !parte.inline.mime.startsWith('image/')) return null
  try {
    const r = await fetchT('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: DEEPSEEK_MODELO,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${parte.inline.mime};base64,${parte.inline.b64}` } },
        ] }],
        max_tokens: 80,
      }),
    }, 30000)
    if (!r.ok) return null
    const j = await r.json()
    return ((j.choices?.[0]?.message?.content) || '').trim() || null
  } catch { return null }
}
async function tgFileBloco(token: string, fid: string, ehPdf: boolean): Promise<GPart | null> {
  const gf = await (await fetchT(`https://api.telegram.org/bot${token}/getFile?file_id=${fid}`)).json()
  if (!gf.ok) return null
  const buf = Buffer.from(await (await fetchT(`https://api.telegram.org/file/bot${token}/${gf.result.file_path}`)).arrayBuffer())
  const b64 = buf.toString('base64')
  return ehPdf
    ? { inline: { mime: 'application/pdf', b64 } }
    : { inline: { mime: mediaBytes(buf), b64 } }
}
function stripHtml(s: string) { return s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 7000) }
async function blocoDeLink(url: string): Promise<GPart | null> {
  try {
    const r = await fetchT(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0' } })
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    if (ct.includes('text/html') || ct.includes('application/json')) { const t = stripHtml(await r.text()); return t.length > 20 ? { text: 'Conteúdo da página do comprovante (via link):\n' + t } : null }
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf[0] === 0x25 && buf[1] === 0x50) return { inline: { mime: 'application/pdf', b64: buf.toString('base64') } }
    if (buf[0] === 0x89 || buf[0] === 0x47 || buf[0] === 0x52 || buf[0] === 0xFF) return { inline: { mime: mediaBytes(buf), b64: buf.toString('base64') } }
    const t = stripHtml(buf.toString('utf8')); return t.length > 20 ? { text: 'Conteúdo da página do comprovante (via link):\n' + t } : null
  } catch { return null }
}

const PROMPT = `Comprovante de PIX brasileiro. Leia com ATENÇÃO ao VALOR (cada dígito) e NÃO INVERTA quem pagou e quem recebeu:
- "cliente" = quem ENVIOU / PAGOU (rótulos no comprovante: De / Origem / Pagador / Remetente / Debitado de / Conta de origem). É de quem SAIU o dinheiro.
- "destinatario" = quem RECEBEU (rótulos: Para / Destino / Recebedor / Favorecido / Beneficiário / Creditado para). É para quem o dinheiro FOI. "destinatario_doc" = CPF/CNPJ DESSE recebedor.
Responda APENAS JSON: {"eh_comprovante": <true; false se NÃO for comprovante de Pix (conversa, foto aleatória)>, "valor": <número em reais, ex 259.00>, "data": "<AAAA-MM-DD>", "cliente": "<quem ENVIOU>", "destinatario": "<quem RECEBEU>", "destinatario_doc": "<CPF/CNPJ do recebedor, só dígitos>", "transacao_id": "<ID da transação / E2E, copie EXATO>"}. Campo ausente = null.`

// Registra uma FALHA de leitura. Depois de 3 tentativas marca 'ilegivel' pra o
// comprovante SAIR da fila (extraiPendentes ignora 'ilegivel'). Antes, um que nunca
// lia ficava eterno em 'recebido' e, sendo o mais antigo, TRAVAVA a fila — os novos
// nunca eram lidos. Aparece na planilha como "⚠️ não consegui ler".
async function marcaFalha(c: Comp, motivo: string) {
  const raw = (c.extraido_raw as Record<string, unknown> | null) || {}
  const t = (Number(raw.tentativas) || 0) + 1
  await sb().from('comprovantes_pix').update({
    extraido_raw: { ...raw, tentativas: t, ultima_falha: motivo },
    status: t >= 3 ? 'ilegivel' : 'recebido',
  }).eq('id', c.id)
}

// A IA às vezes emite o JSON e DEPOIS continua ("Wait, let me re-read...") ou manda um
// 2º bloco — aí dar JSON.parse no texto todo quebra (json-fail) e o comprovante TRAVA em
// 'recebido'. Pega o PRIMEIRO objeto {...} balanceado (respeitando strings) e ignora o resto.
function primeiroJson(txt: string): any | null {
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

// O ID da transação (E2E) NÃO tem espaços — mas a IA às vezes o lê com espaço, hífen-suave
// ou caractere invisível (zero-width) em posições ALEATÓRIAS. Aí o MESMO Pix reenviado gera
// IDs "diferentes", o dedup (que compara o ID exato) não agrupa e conta em dobro sem avisar.
// Limpar pra só letras/números resolve — e conserta a data embutida (dataDoId depende da posição).
function limpaId(id: unknown): string | null { const s = String(id ?? '').replace(/[^A-Za-z0-9]/g, ''); return s || null }

// 3ª leitura focada SÓ no valor — desempate quando as 2 primeiras discordam.
async function leValorFocado(parte: GPart): Promise<number | null> {
  try {
    const txt = await geminiLe([parte, { text: 'Leia com atenção MÁXIMA só o VALOR em reais deste comprovante Pix. Responda só JSON: {"valor":<número>}' }], 60)
    const jj = primeiroJson(txt) || {}
    return parseValor(jj.valor)
  } catch { return null }
}

// Responde no grupo, logo abaixo do comprovante, o que a IA entendeu — pedido do
// dono: "separando valor, nome, entre outras coisas". Best-effort (nunca trava).
function respondeLeitura(loja: Loja, c: Comp, status: string, j: any, dataFinal: string | null) {
  if (!c.telegram_message_id) return
  let txt: string | null = null
  if (status === 'nao_comprovante') txt = 'ℹ️ Não parece comprovante de Pix.'
  else if (status === 'incompleto') txt = '⚠️ Li o Pix, mas não achei quem RECEBEU (destinatário).'
  else if (status === 'data_divergente') txt = '⚠️ Data do Pix parece diferente de hoje — confere.'
  else if (status === 'extraido') {
    const linhas = ['✅ Pix lido:']
    if (j.valor != null) linhas.push('💰 R$ ' + money(j.valor))
    if (j.cliente) linhas.push('👤 De: ' + j.cliente)
    if (j.destinatario) linhas.push('🏢 Para: ' + j.destinatario)
    if (dataFinal) linhas.push('📅 ' + fmtDataBR(dataFinal))
    if (j.transacao_id) linhas.push('🔑 ' + j.transacao_id)
    if (j.valor_incerto) linhas.push('⚠️ Valor incerto — confere na mão')
    txt = linhas.join('\n')
  }
  if (txt) tgSend(loja.token, loja.grupo, txt, c.telegram_message_id)
}

// extrai UM comprovante (2 leituras + desempate no valor). Atualiza a linha no banco.
async function extraiUm(loja: Loja, c: Comp) {
  let parte: GPart | null = null
  if (c.formato === 'link') { if (!c.arquivo_url) return marcaFalha(c, 'sem-url'); parte = await blocoDeLink(c.arquivo_url) }
  else if (c.arquivo_file_id) parte = await tgFileBloco(loja.token, c.arquivo_file_id, c.formato === 'pdf')
  if (!parte) return marcaFalha(c, 'sem-conteudo')
  let txt
  try { txt = await geminiLe([parte, { text: PROMPT }], 400) }
  catch (e) { return marcaFalha(c, 'api: ' + String((e as Error)?.message || e).slice(0, 120)) }
  const j: any = primeiroJson(txt)
  if (!j) return marcaFalha(c, 'json-fail :: ' + (txt || '').replace(/\s+/g, ' ').slice(0, 600))
  j.transacao_id = limpaId(j.transacao_id)
  const supa = sb()
  if (j.eh_comprovante === false) { await supa.from('comprovantes_pix').update({ status: 'nao_comprovante', extraido_raw: j }).eq('id', c.id); respondeLeitura(loja, c, 'nao_comprovante', j, null); return }
  // 2ª leitura focada nos 2 campos que mais erram
  try {
    const jj = primeiroJson(await geminiLe([parte, { text: 'Leia com atenção MÁXIMA só isto deste comprovante Pix. JSON: {"valor":<número>,"transacao_id":"<ID da transação/E2E, EXATO caractere por caractere>"}' }], 120)) || {}
    jj.transacao_id = limpaId(jj.transacao_id)
    const v2 = parseValor(jj.valor)
    if (v2 != null && j.valor == null) j.valor = v2
    else if (v2 != null && j.valor != null && Math.abs(v2 - Number(j.valor)) > 0.01) {
      // as 2 leituras discordam no valor → 3ª leitura desempata (best-of-3)
      const v3 = await leValorFocado(parte)
      if (v3 != null && Math.abs(v3 - v2) < 0.01) j.valor = v2                         // 2 de 3 = leitura 2
      else if (v3 != null && Math.abs(v3 - Number(j.valor)) < 0.01) { /* 2 de 3 = leitura 1, mantém */ }
      else { j.valor_incerto = true; j.valor_leitura2 = v2; if (v3 != null) j.valor_leitura3 = v3 } // 3 valores diferentes → marca incerto
    }
    if (jj.transacao_id && dataDoId(jj.transacao_id) && !dataDoId(j.transacao_id)) j.transacao_id = jj.transacao_id
  } catch { /* leitura 2 é best-effort */ }
  // 2ª opinião (DeepSeek Vision) no VALOR — cruza com o Gemini. Discordou → marca
  // incerto (não grava errado); Gemini sem valor → usa o do DeepSeek.
  try {
    const txtDs = await deepseekLe(parte, 'Leia com atenção MÁXIMA só o VALOR em reais deste comprovante Pix. Responda só o número (ex: 259.00).')
    const vDs = parseValor(txtDs)
    if (vDs != null) {
      if (j.valor == null) j.valor = vDs
      else if (Math.abs(vDs - Number(j.valor)) > 0.01) { j.valor_incerto = true; j.valor_deepseek = vDs }
    }
  } catch { /* best-effort */ }
  const semDest = !j.destinatario || !String(j.destinatario).trim()
  const rec = c.recebido_em ? String(c.recebido_em).slice(0, 10) : null
  const dataFinal = resolveData(dataDoId(j.transacao_id), j.data, rec)
  const status = semDest ? 'incompleto' : (dataFinal && rec && diaDiff(dataFinal, rec) > 2 ? 'data_divergente' : 'extraido')
  await supa.from('comprovantes_pix').update({ valor: j.valor, data_pix: dataFinal, pagador: j.cliente || null, destinatario: j.destinatario || null, transacao_id: j.transacao_id || null, status, extraido_raw: j }).eq('id', c.id)
  respondeLeitura(loja, c, status, j, dataFinal)
}

// processa os pendentes (o recém-chegado + até `limite` outros que faltaram) — drena buracos
async function extraiPendentes(loja: Loja, limite = 8) {
  const { data } = await sb().from('comprovantes_pix').select('*')
    .in('formato', ['foto', 'pdf', 'link']).eq('telegram_chat_id', loja.grupo)
    .neq('status', 'nao_comprovante').neq('status', 'incompleto').neq('status', 'ilegivel')
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
  // 'apagado' fica FORA do dedup: foi excluído no grupo (espelho) e não pode ser
  // ressuscitado nem virar o "original" que marca um vivo como duplicado.
  for (const c of (cs || []) as Comp[]) { if (!c.transacao_id || c.status === 'apagado') continue; (grupos[c.transacao_id] = grupos[c.transacao_id] || []).push(c) }
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

  // CROSS-GROUP: o MESMO Pix (mesmo ID) postado nos DOIS grupos (lojas diferentes) —
  // contaria em dobro. O robô AVISA (não escolhe qual vale — pedido do Vitor); as
  // atendentes conferem de qual loja é e apagam do grupo errado (a planilha é espelho).
  const outro = GRUPOS.find((g) => g !== loja.grupo)
  const txs = [...new Set((cs || []).filter((c) => (c as Comp).status !== 'apagado').map((c) => (c as Comp).transacao_id).filter(Boolean))] as string[]
  if (outro && txs.length) {
    for (let i = 0; i < txs.length; i += 100) {
      const { data: noOutro } = await supa.from('comprovantes_pix')
        .select('transacao_id, valor, destinatario').eq('telegram_chat_id', outro)
        .neq('status', 'nao_comprovante').neq('status', 'apagado').in('transacao_id', txs.slice(i, i + 100))
      for (const o of (noOutro || []) as Comp[]) {
        const aqui = (cs || []).find((c) => (c as Comp).transacao_id === o.transacao_id) as Comp | undefined
        if (!aqui || (aqui.extraido_raw as { cross_avisado?: boolean } | null)?.cross_avisado) continue
        const txt = '⚠️ ESTE PIX ESTÁ NOS DOIS GRUPOS (Petrópolis e Teresópolis)\n'
          + (o.valor != null ? 'Valor: R$ ' + money(o.valor) + '\n' : '')
          + (o.destinatario ? 'Para: ' + o.destinatario + '\n' : '')
          + 'O mesmo Pix (ID ' + o.transacao_id + ') foi postado nos dois grupos. Vejam de qual LOJA é e apaguem do grupo errado — pra não contar em dobro.'
        await tgSend(loja.token, loja.grupo, txt)
        await supa.from('comprovantes_pix').update({ extraido_raw: { ...((aqui.extraido_raw as object) || {}), cross_avisado: true } }).eq('id', aqui.id)
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
  const r = await fetchT('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })
  const j = await r.json()
  if (!j.access_token) throw new Error('google token: ' + JSON.stringify(j).slice(0, 120))
  return j.access_token
}
const gh = (token: string) => ({ Authorization: 'Bearer ' + token })
// garante a ABA por nome (cria se faltar) → retorna sheetId
async function garanteAba(token: string, aba: string): Promise<number> {
  const meta = await (await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(title,sheetId)`, { headers: gh(token) })).json()
  const found = (meta.sheets || []).find((s: any) => s.properties?.title === aba)
  if (found) return found.properties.sheetId
  const add = await (await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, { method: 'POST', headers: { ...gh(token), 'content-type': 'application/json' }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: aba } } }] }) })).json()
  return add.replies[0].addSheet.properties.sheetId
}
async function periodoAberto(grupo: number) {
  const { data } = await sb().from('pix_periodos').select('*').eq('telegram_chat_id', grupo).is('fechado_em', null).order('aberto_em', { ascending: false }).limit(1)
  return data && data[0]
}
// ESPELHO: tira da planilha os comprovantes APAGADOS no grupo. O bot não vê exclusões,
// então uma CONTA logada (GramJS) LÊ o grupo e marca 'apagado' os que sumiram. Avalia SÓ os
// que estão no RANGE de mensagens que realmente li (msg_id >= menor lido) — os mais antigos
// que isso ficam de fora (não sei se estão vivos), evitando falso-positivo com IDs antigos.
// Assim pega apagado de QUALQUER data recente, não só do período aberto. Se não conseguir
// ler o grupo, NÃO apaga nada (trava de segurança pra não zerar a planilha por engano).
async function reconcilaApagados(loja: Loja) {
  const sess = process.env.TELEGRAM_SESSION, apiId = Number(process.env.TELEGRAM_API_ID || 0), apiHash = process.env.TELEGRAM_API_HASH
  if (!sess || !apiId || !apiHash) return
  try {
    const { TelegramClient } = await import('telegram')
    const { StringSession } = await import('telegram/sessions')
    const client = new TelegramClient(new StringSession(sess), apiId, apiHash, { connectionRetries: 3 })
    await client.connect()
    const vivos = new Set<number>()
    try { for await (const m of client.iterMessages(loja.grupo, { limit: 2000 })) vivos.add(m.id) } catch { /* segue */ }
    await client.disconnect().catch(() => {})
    if (vivos.size === 0) return
    const minVivo = Math.min(...vivos) // menor msg_id que REALMENTE li — abaixo disso não avalio (não sei se vive)
    const supa = sb()
    // TRAVA anti falso-positivo: só marca apagado se o casamento de msg_id com a conta logada
    // estiver CONFIÁVEL. Testa com o comprovante mais recente (que quase certo existe): se ele
    // NÃO aparece em vivos, o casamento está furado (migração de grupo / leitura parcial) →
    // aborta sem apagar nada. (Sem isso, uma leitura ruim marcou 67 comprovantes reais como
    // apagado e zerou o caixa — 28/07.)
    const { data: recente } = await supa.from('comprovantes_pix').select('telegram_message_id')
      .eq('telegram_chat_id', loja.grupo).lt('telegram_message_id', 700000000)
      .neq('status', 'apagado').neq('status', 'nao_comprovante')
      .order('telegram_message_id', { ascending: false }).limit(1)
    const refId = (recente || [])[0]?.telegram_message_id
    if (!refId || !vivos.has(refId)) { console.error('reconcila: casamento msg_id nao confiavel — abortado (nada apagado)'); return }
    const { data } = await supa.from('comprovantes_pix').select('id, telegram_message_id')
      .eq('telegram_chat_id', loja.grupo).gte('telegram_message_id', minVivo)
      .lt('telegram_message_id', 700000000).neq('status', 'nao_comprovante').neq('status', 'apagado')
    for (const c of (data || []) as { id: string; telegram_message_id: number }[]) {
      if (!vivos.has(c.telegram_message_id)) await supa.from('comprovantes_pix').update({ status: 'apagado' }).eq('id', c.id)
    }
  } catch (e) { console.error('reconcilaApagados:', e) }
}

async function escreveSheet(loja: Loja) {
  const token = await googleToken()
  const sheetId = await garanteAba(token, loja.aba)
  const per = await periodoAberto(loja.grupo)
  let q = sb().from('comprovantes_pix').select('*').eq('telegram_chat_id', loja.grupo).neq('status', 'nao_comprovante').neq('status', 'apagado')
  if (per) q = q.gte('recebido_em', per.aberto_em)
  const { data: csRaw } = await q.order('recebido_em')
  const cs = (csRaw || []) as Comp[]
  const valDe = (c: Comp) => (c.status === 'duplicado' || c.status === 'incompleto' || c.status === 'ilegivel' ? 0 : Number(c.valor) || 0)

  const dups = cs.filter((c) => c.status === 'duplicado').length
  const incompletos = cs.filter((c) => c.status === 'incompleto' || c.status === 'ilegivel').length
  const validos = cs.length - dups - incompletos
  const geral = cs.reduce((s, c) => s + valDe(c), 0)

  const linhas: (string | number)[][] = [['Data', 'Cliente (sistema)', 'Nome no Pix', 'Quem recebeu', 'Valor (R$)']]
  const rowTypes: string[] = ['header']
  for (const c of cs) {
    const v = Number(c.valor) || 0
    const cliente = (c.cliente_sistema || '').trim() || (c.pagador || '').trim() || '—'
    linhas.push([fmtDataBR(c.data_pix), cliente, c.pagador || '—', c.destinatario || '—', c.valor != null ? v : ''])
    rowTypes.push('dado')
  }
  const notas = [validos + ' comprovantes']
  if (dups) notas.push(dups + ' duplicado' + (dups > 1 ? 's' : ''))
  if (incompletos) notas.push(incompletos + ' incompleto' + (incompletos > 1 ? 's' : ''))
  linhas.push(['', 'TOTAL GERAL (' + notas.join(' · ') + ')', '', '', geral])
  rowTypes.push('total')

  const R = (t: string) => encodeURIComponent(`${t}!A1:Z2000`)
  const RA1 = (t: string) => encodeURIComponent(`${t}!A1`)
  await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${R(loja.aba)}:clear`, { method: 'POST', headers: gh(token) })
  await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RA1(loja.aba)}?valueInputOption=RAW`, { method: 'PUT', headers: { ...gh(token), 'content-type': 'application/json' }, body: JSON.stringify({ values: linhas }) })

  // DESIGN (marca TecnoCell #1B6CA8)
  const AZUL = { red: 0.106, green: 0.424, blue: 0.659 }, BRANCO = { red: 1, green: 1, blue: 1 }
  const nRows = linhas.length, nCols = 5
  const rowFmt = (r: number, fmt: object, fields: string) => ({ repeatCell: { range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: fmt }, fields } })
  const reqs: object[] = []
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 2000, startColumnIndex: 0, endColumnIndex: 26 }, cell: {}, fields: 'userEnteredFormat' } })
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: nRows, startColumnIndex: 0, endColumnIndex: nCols }, cell: { userEnteredFormat: { textFormat: { fontSize: 10 }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat,verticalAlignment)' } })
  reqs.push(rowFmt(0, { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: BRANCO, fontSize: 11 }, horizontalAlignment: 'CENTER' }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'))
  reqs.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } })
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: nRows, startColumnIndex: 4, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '"R$" #,##0.00' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  reqs.push({ repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: nRows, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } })
  rowTypes.forEach((t, i) => {
    if (i === 0) return
    if (t === 'total') reqs.push(rowFmt(i, { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: BRANCO, fontSize: 11 } }, 'userEnteredFormat(backgroundColor,textFormat)'))
  })
  const w = (c: number, px: number) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  reqs.push(w(0, 90), w(1, 220), w(2, 200), w(3, 200), w(4, 110))
  await fetchT(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, { method: 'POST', headers: { ...gh(token), 'content-type': 'application/json' }, body: JSON.stringify({ requests: reqs }) }).catch(() => {})
  return { n: validos, soma: geral, dups }
}

// RELEITURA COMPLETA do período (todos os comprovantes entre /abrir e /fechar). Não cabe
// nos 60s → worker PAUSADO que relê ~40s por chamada e se AUTO-CHAMA (cursor vai na URL,
// sem precisar de migração) até acabar. Reaproveita extraiUm (mesma qualidade da leitura).
async function relerLista(loja: Loja): Promise<string[]> {
  const { data: ps } = await sb().from('pix_periodos').select('aberto_em, fechado_em').eq('telegram_chat_id', loja.grupo).order('aberto_em', { ascending: false }).limit(1)
  const p = (ps || [])[0]; if (!p) return []
  const ate = p.fechado_em || new Date().toISOString()
  const { data } = await sb().from('comprovantes_pix').select('id')
    .eq('telegram_chat_id', loja.grupo).gte('recebido_em', p.aberto_em).lte('recebido_em', ate)
    .neq('status', 'nao_comprovante').neq('status', 'apagado').lt('telegram_message_id', 700000000)
    .order('telegram_message_id')
  return (data || []).map((c) => (c as { id: string }).id)
}
async function disparaReler(loja: Loja, cursor: number) {
  try { await fetchT(`${BASE}/api/telegram/comprovante?loja=${loja.slug}&job=reler&cursor=${cursor}`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET || '' } }, 8000) } catch { /* segue */ }
}
async function processaReler(loja: Loja, cursor: number) {
  const ids = await relerLista(loja)
  let cur = cursor; const t0 = Date.now()
  while (cur < ids.length && Date.now() - t0 < 40000) {
    const { data: full } = await sb().from('comprovantes_pix').select('*').eq('id', ids[cur]).maybeSingle()
    if (full) { try { await extraiUm(loja, full as Comp) } catch { /* um ruim não trava o resto */ } }
    cur++
  }
  await deduplica(loja); await escreveSheet(loja)
  if (cur >= ids.length) await tgSend(loja.token, loja.grupo, '✅ Releitura completa — ' + ids.length + ' comprovantes do período relidos.')
  else await disparaReler(loja, cur) // continua na próxima chamada (fora dos 60s)
}

// ---------- /abrir e /fechar ----------
async function abrir(loja: Loja, quem: string | null) {
  const p = await periodoAberto(loja.grupo)
  if (p) { await tgSend(loja.token, loja.grupo, '⚠️ Já tem uma contagem ABERTA desde ' + new Date(p.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '. Use /fechar antes de abrir outra.'); return }
  await sb().from('pix_periodos').insert({ id: crypto.randomUUID(), telegram_chat_id: loja.grupo, aberto_em: new Date().toISOString(), aberto_por: quem || null })
  await tgSend(loja.token, loja.grupo, '✅ Contagem do Pix ABERTA' + (quem ? ' por ' + quem : '') + '. Pode mandar os comprovantes.')
}
async function fechar(loja: Loja, p: any, quem: string | null) {
  const { data: cs } = await sb().from('comprovantes_pix').select('*').eq('telegram_chat_id', loja.grupo).gte('recebido_em', p.aberto_em).neq('status', 'duplicado').neq('status', 'nao_comprovante').neq('status', 'incompleto').neq('status', 'apagado').order('recebido_em')
  const groups = agrupaPorDestino((cs || []) as Comp[]); const keys = Object.keys(groups).sort()
  let geral = 0, resumo = '📊 FECHAMENTO DO PIX' + (quem ? ' — ' + quem : '') + '\n'
  resumo += '(' + new Date(p.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) + ' → agora)\n\n'
  for (const k of keys) { const g = groups[k]; const soma = g.itens.reduce((s, c) => s + (Number(c.valor) || 0), 0); geral += soma; resumo += '• ' + g.itens.length + ' imagens — ' + g.nome + ' — R$ ' + money(soma) + '\n' }
  resumo += '\n💰 TOTAL: R$ ' + money(geral) + ' · ' + (cs || []).length + ' comprovantes'
  await tgSend(loja.token, loja.grupo, resumo)
  // fecha o período e ENFILEIRA o arquivo agrupado (fotos+pdfs+links). Reenviar 30+ de uma
  // vez estoura os 60s e o flood-control do Telegram (o álbum de foto é o 1º a ser barrado —
  // era por isso que sumiam as fotos). Agora o worker manda pausado, em segundo plano.
  await sb().from('pix_periodos').update({ fechado_em: new Date().toISOString(), fechado_por: quem || null, reenvio_ativo: true, reenvio_cursor: 0 }).eq('id', p.id)
  await disparaReenvio(loja)
}

// ---------- arquivo do fechamento: reenvio PAUSADO em segundo plano ----------
// /fechar só enfileira; este worker manda ~1 item a cada 4s (≈15/min, dentro do limite do
// Telegram), até ~45s por chamada, e se AUTO-CHAMA (fora dos 60s) até esvaziar a fila.
const BASE = process.env.APP_BASE_URL || 'https://tecnocell-cloud.vercel.app'
async function disparaReenvio(loja: Loja) {
  try { await fetchT(`${BASE}/api/telegram/comprovante?loja=${loja.slug}&job=reenvio`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET || '' } }) } catch { /* segue */ }
}
// Imagem enviada COMO ARQUIVO vira 'document' no Telegram, mas o bot marca 'foto' — aí o
// sendPhoto recusa ("can't use file of type Document as Photo") e a imagem sumia do arquivo.
// Tenta como foto; se recusar, manda como documento (sempre funciona pra imagem).
async function enviaFoto(loja: Loja, fid: string) {
  const r = await tgPost(loja.token, 'sendPhoto', { chat_id: loja.grupo, photo: fid })
  if (r && (r as { ok?: boolean }).ok) return
  await tgPost(loja.token, 'sendDocument', { chat_id: loja.grupo, document: fid })
}
async function itensReenvio(loja: Loja, p: { aberto_em: string; fechado_em: string | null }): Promise<Array<Record<string, unknown>>> {
  const ate = p.fechado_em || new Date().toISOString()
  const { data: cs } = await sb().from('comprovantes_pix').select('*')
    .eq('telegram_chat_id', loja.grupo).gte('recebido_em', p.aberto_em).lte('recebido_em', ate)
    .neq('status', 'duplicado').neq('status', 'nao_comprovante').neq('status', 'incompleto').neq('status', 'apagado')
    .order('recebido_em')
  const groups = agrupaPorDestino((cs || []) as Comp[]); const keys = Object.keys(groups).sort()
  const itens: Array<Record<string, unknown>> = []
  for (const k of keys) {
    const g = groups[k]; const soma = g.itens.reduce((s, c) => s + (Number(c.valor) || 0), 0)
    itens.push({ t: 'h', nome: g.nome, n: g.itens.length, soma })
    for (const c of g.itens) {
      if (c.formato === 'foto' && c.arquivo_file_id) itens.push({ t: 'foto', fid: c.arquivo_file_id })
      else if (c.formato === 'pdf' && c.arquivo_file_id) itens.push({ t: 'pdf', fid: c.arquivo_file_id })
      else if (c.formato === 'link' && c.arquivo_url) itens.push({ t: 'link', url: c.arquivo_url })
    }
  }
  return itens
}
async function processaReenvio(loja: Loja) {
  const { data: ps } = await sb().from('pix_periodos').select('*').eq('telegram_chat_id', loja.grupo).eq('reenvio_ativo', true).order('fechado_em', { ascending: false }).limit(1)
  const p = (ps || [])[0]; if (!p) return
  const itens = await itensReenvio(loja, p)
  let cur = Number(p.reenvio_cursor) || 0
  const t0 = Date.now()
  while (cur < itens.length && Date.now() - t0 < 45000) {
    const it = itens[cur]
    try {
      if (it.t === 'h') await tgSend(loja.token, loja.grupo, '📎 ' + it.nome + ' — ' + it.n + ' comprovantes — R$ ' + money(it.soma as number))
      else if (it.t === 'foto') await enviaFoto(loja, it.fid as string)
      else if (it.t === 'pdf') await tgPost(loja.token, 'sendDocument', { chat_id: loja.grupo, document: it.fid })
      else if (it.t === 'link') await tgSend(loja.token, loja.grupo, '🔗 ' + it.url)
    } catch { /* um item ruim não trava a fila */ }
    cur++
    await sb().from('pix_periodos').update({ reenvio_cursor: cur }).eq('id', p.id)
    if (cur < itens.length && Date.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 4000))
  }
  if (cur >= itens.length) {
    await sb().from('pix_periodos').update({ reenvio_ativo: false }).eq('id', p.id)
    await tgSend(loja.token, loja.grupo, '✅ Arquivo do fechamento completo — ' + itens.length + ' itens enviados.')
  } else {
    await disparaReenvio(loja) // continua numa próxima chamada (fora dos 60s)
  }
}

// ---------- pipeline de uma mensagem ----------
async function processa(loja: Loja, update: any) {
  const m = update.message || update.channel_post
  if (!m || !m.chat || m.chat.id !== loja.grupo) return
  const txt = (m.text || '').trim().toLowerCase()
  const quem = m.from ? ((m.from.first_name || '') + (m.from.last_name ? ' ' + m.from.last_name : '')).trim() : null
  if (txt.startsWith('/abrir')) { await abrir(loja, quem); await escreveSheet(loja); return }
  if (txt.startsWith('/revisar')) {
    // ESPELHO REMOVIDO: o grupo tem mensagem que SOME (auto-delete/limpeza) e "sumiu do
    // Telegram" NÃO quer dizer "comprovante inválido" — o pagamento é real. Marcar apagado
    // por isso zerava o caixa. /revisar agora só RELÊ os comprovantes do período.
    await disparaReler(loja, 0)
    await tgSend(loja.token, loja.grupo, '🔄 Relendo todos os comprovantes do período... aviso quando terminar.')
    return
  }
  if (txt.startsWith('/fechar')) { const p = await periodoAberto(loja.grupo); if (p) await fechar(loja, p, quem); else await tgSend(loja.token, loja.grupo, 'ℹ️ Não há contagem aberta. Use /abrir primeiro.'); await escreveSheet(loja); return }
  if (txt.startsWith('/cliente')) {
    const nome = (m.text || '').trim().slice(8).trim() // tira o '/cliente' (8 chars)
    const alvo = m.reply_to_message?.message_id
    if (!alvo) { await tgSend(loja.token, loja.grupo, 'ℹ️ Responda o comprovante (foto/PDF) com /cliente NOME'); return }
    if (!nome) { await tgSend(loja.token, loja.grupo, 'ℹ️ Uso: /cliente NOME (respondendo o comprovante)'); return }
    const { error } = await sb().from('comprovantes_pix').update({ cliente_sistema: nome }).eq('telegram_chat_id', loja.grupo).eq('telegram_message_id', alvo)
    if (error) { await tgSend(loja.token, loja.grupo, '❌ Não achei o comprovante. Responda direto na foto/PDF.'); return }
    await tgSend(loja.token, loja.grupo, '✅ Cliente: ' + nome)
    try { await escreveSheet(loja) } catch (e) { console.error('sheet cliente:', e) }
    return
  }

  const t = tipo(m)
  if (!t) return // texto puro sem url = ignora
  const { data: novo, error: upErr } = await sb().from('comprovantes_pix').upsert({
    telegram_chat_id: loja.grupo, telegram_message_id: m.message_id, recebido_em: new Date((m.date || 0) * 1000).toISOString(),
    formato: t.f, arquivo_file_id: 'fid' in t ? t.fid : null, arquivo_url: 'url' in t ? t.url : null, status: 'recebido',
  }, { onConflict: 'telegram_chat_id,telegram_message_id' }).select().maybeSingle()
  if (upErr) console.error('upsert comprovante:', upErr.message)

  // LÊ O RECÉM-CHEGADO PRIMEIRO. Antes a planilha rodava antes da leitura e, se o Google
  // travasse a conexão (sem timeout), a função congelava e o comprovante ficava "não lido"
  // (tentativas=0). Agora cada etapa é ISOLADA: uma travar não impede a próxima, e a leitura
  // do novo acontece antes de qualquer coisa que possa demorar (planilha/dedup).
  try { if (novo && (novo as Comp).status === 'recebido') await extraiUm(loja, novo as Comp) } catch (e) { console.error('extraiUm novo:', e) }
  try { await escreveSheet(loja) } catch (e) { console.error('sheet1:', e) }
  try {
    await extraiPendentes(loja, DRENA_POR_MSG) // drena atrasados (backlog)
    await deduplica(loja)
    await escreveSheet(loja)
  } catch (e) { console.error('drena/dedup:', e) }
}

export async function POST(req: Request) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) return new NextResponse('forbidden', { status: 401 })
  const loja = lojaDe(new URL(req.url).searchParams.get('loja') || '')
  if (!loja || !loja.token || !loja.grupo) return NextResponse.json({ ok: true }) // loja desconhecida/sem config — ignora
  // auto-chamada do worker do arquivo pausado (não é update do Telegram)
  if (new URL(req.url).searchParams.get('job') === 'reenvio') {
    after(async () => { try { await processaReenvio(loja as Loja) } catch (e) { console.error('reenvio:', e) } })
    return NextResponse.json({ ok: true })
  }
  if (new URL(req.url).searchParams.get('job') === 'reler') {
    const cursor = Number(new URL(req.url).searchParams.get('cursor') || 0)
    after(async () => { try { await processaReler(loja as Loja, cursor) } catch (e) { console.error('reler:', e) } })
    return NextResponse.json({ ok: true })
  }
  let update: unknown
  try { update = await req.json() } catch { return NextResponse.json({ ok: true }) }
  // Responde 200 NA HORA e processa DEPOIS (after): extração Sonnet + planilha passam de 60s
  // no cold-start → o Telegram dava "Read timeout" e REENVIAVA. after() roda pós-resposta.
  after(async () => { try { await processa(loja as Loja, update) } catch (e) { console.error('comprovante webhook:', e) } })
  return NextResponse.json({ ok: true }) // 200 imediato — sem retry-storm do Telegram
}
