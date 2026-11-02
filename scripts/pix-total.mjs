// Totais de Pix do Telegram — desde 01/10/2026 ate hoje, por chave (destinatario).
// Uso: node scripts/pix-total.mjs [AAAA-MM-DD]
import { readFileSync } from 'node:fs'
import { nomeDaChave } from '../lib/pix-chaves.ts'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const out = []
for (let de = 0; ; de += 1000) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/comprovantes_pix?select=id,telegram_chat_id,recebido_em,data_pix,valor,pagador,destinatario,status,transacao_id,extraido_raw&order=recebido_em.asc`, { headers: { ...H, Range: `${de}-${de + 999}`, 'Range-Unit': 'items' } })
  const l = await r.json(); out.push(...l); if (l.length < 1000) break
}

const semAcento = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const limpaNome = (s) => semAcento(s).toUpperCase().replace(/^[\d.\-\/\s]+/, '').replace(/[^A-Z0-9]+/g, ' ').trim()
const raiz = (s) => (String(s || '').match(/^[\d.\-\s]{6,}/) || [''])[0].replace(/\D/g, '')
const docRaw = (c) => String(c.extraido_raw?.destinatario_doc || '').replace(/\D/g, '')
const doc14 = (c) => { const d = docRaw(c); return d.length === 14 ? d : '' }

const INI = process.argv[2] || '2026-10-01'
const FIM = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const periodo = out.filter((r) => r.data_pix >= INI && r.data_pix <= FIM)
const NAO_SOMA = new Set(['duplicado', 'incompleto', 'ilegivel', 'recebido', 'nao_comprovante', 'apagado'])
const validos = periodo.filter((r) => !NAO_SOMA.has(r.status) && r.valor != null)

const vistos = new Set(); const unicos = []; let repetidos = 0
for (const r of validos) {
  if (r.transacao_id) { if (vistos.has(r.transacao_id)) { repetidos++; continue } vistos.add(r.transacao_id) }
  unicos.push(r)
}

function agrupa(list) {
  const N = list.length, parent = list.map((_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const uni = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  const nn = list.map((c) => limpaNome(c.destinatario)), doc = list.map((c) => doc14(c))
  const porNome = {}, porDoc = {}
  list.forEach((_, i) => { if (nn[i]) { if (porNome[nn[i]] != null) uni(i, porNome[nn[i]]); else porNome[nn[i]] = i } })
  list.forEach((_, i) => { if (doc[i]) { if (porDoc[doc[i]] != null) uni(i, porDoc[doc[i]]); else porDoc[doc[i]] = i } })
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = nn[i], b = nn[j]
    if (a.length >= 10 && b.length >= 10 && (a.startsWith(b) || b.startsWith(a))) uni(i, j)
  }
  const baldes = {}
  list.forEach((c, i) => { const r = find(i); (baldes[r] = baldes[r] || []).push(c) })
  return Object.values(baldes).map((itens) => {
    const cont = {}
    for (const c of itens) { const n = (c.destinatario || '').trim(); if (n) cont[n] = (cont[n] || 0) + 1 }
    const nome = Object.entries(cont).sort((a, b) => (b[1] - a[1]) || (a[0].includes('*') - b[0].includes('*')) || (a[0].length - b[0].length))[0]?.[0] || '(sem destinatario)'
    const docs = {}
    for (const c of itens) { const d = doc14(c); if (d) docs[d] = (docs[d] || 0) + 1 }
    return { nome, itens, doc: Object.entries(docs).sort((a, b) => b[1] - a[1])[0]?.[0] || '', soma: itens.reduce((s, c) => s + Number(c.valor || 0), 0) }
  })
}

const grupos = agrupa(unicos)
// liga grupo sem CNPJ cheio numa chave conhecida: raiz do CNPJ ("38.216.415") ou CNPJ truncado
const cheios = [...new Set(grupos.map((g) => g.doc).filter(Boolean))]
const paraChave = new Map()
for (const g of grupos) {
  if (g.doc) { paraChave.set(g, g.doc); continue }
  let alvo = null
  const r = raiz(g.nome)
  if (r.length >= 7) alvo = cheios.filter((d) => d.startsWith(r))
  if (!alvo?.length) {
    const docs = [...new Set(g.itens.map(docRaw).filter((d) => d.length >= 6))]
    for (const d of docs) { const c = cheios.filter((x) => x.includes(d)); if (c.length === 1) { alvo = c; break } }
  }
  paraChave.set(g, alvo && alvo.length === 1 ? alvo[0] : '#SOLTO#' + g.nome)
}
const chaves = new Map()
for (const g of grupos) {
  const k = paraChave.get(g)
  const cur = chaves.get(k) || { doc: k.startsWith('#') ? '' : k, n: 0, soma: 0, nomes: {} }
  cur.n += g.itens.length; cur.soma += g.soma
  for (const [nome, q] of Object.entries(g.itens.reduce((a, c) => ((a[(c.destinatario || '').trim()] = (a[(c.destinatario || '').trim()] || 0) + 1), a), {}))) cur.nomes[nome] = (cur.nomes[nome] || 0) + q
  chaves.set(k, cur)
}
const final = [...chaves.entries()]
  .map(([, v]) => ({ doc: v.doc, n: v.n, soma: v.soma, nome: Object.entries(v.nomes).sort((a, b) => (b[1] - a[1]) || (a[0].includes('*') - b[0].includes('*')))[0][0] }))
  .sort((a, b) => b.soma - a.soma)
const geral = final.reduce((s, x) => s + x.soma, 0)

console.log('periodo data_pix', INI, '->', FIM, '| linhas', periodo.length, '| somam', final.reduce((s, x) => s + x.n, 0), '| R$', geral.toFixed(2))
console.log('fora:', JSON.stringify(periodo.filter((r) => NAO_SOMA.has(r.status)).reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {})), '| E2E repetido:', repetidos, '| sem E2E:', unicos.filter((r) => !r.transacao_id).length)
for (const id of [...new Set(unicos.map((r) => r.telegram_chat_id))].sort()) {
  const g = unicos.filter((r) => r.telegram_chat_id === id)
  console.log('grupo', id, '->', g.length, 'comprovantes | R$', g.reduce((s, r) => s + Number(r.valor || 0), 0).toFixed(2))
}
console.log('')
for (const x of final) console.log(`R$ ${x.soma.toFixed(2).padStart(9)} | ${String(x.n).padStart(4)}x | CNPJ ${x.doc || '—'.padEnd(14)} | ${nomeDaChave(x.nome, x.doc).padEnd(9)} | ${x.nome}`)
