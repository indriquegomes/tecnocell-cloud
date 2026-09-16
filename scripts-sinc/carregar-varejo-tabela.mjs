import fs from 'node:fs'
import JSZip from 'jszip'
import crypto from 'node:crypto'

const env = {}
const t = fs.readFileSync('C:/Users/usuario/tecnocell-cloud/.env.local', 'utf8').replace(/^\ufeff/, '')
for (const l of t.split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim() }
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, authorization: 'Bearer ' + K, 'content-type': 'application/json' }
const DRY = process.argv.includes('dry')

function uuid5(name) { const h = crypto.createHash('sha1').update(name).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-5' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32) }

const dir = 'C:/Users/usuario/Downloads'
const nomeArq = fs.readdirSync(dir).find((f) => /VAREJO/i.test(f) && /\.xlsx$/i.test(f))
if (!nomeArq) { console.error('nao achei o arquivo VAREJO em Downloads'); process.exit(1) }
const ARQ = dir + '/' + nomeArq
console.log('arquivo:', nomeArq)

// xlsx
const buf = fs.readFileSync(ARQ)
const zip = await JSZip.loadAsync(buf)
const comp = []
const ss = await zip.file('xl/sharedStrings.xml')?.async('string')
if (ss) for (const si of ss.split('<si>').slice(1)) comp.push([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
const sheet = Object.keys(zip.files).find((f) => /^xl\/worksheets\/sheet1\.xml$/.test(f))
const xml = await zip.file(sheet).async('string')
const colIdx = (l) => { let n = 0; for (const c of l) n = n * 26 + (c.charCodeAt(0) - 64); return n }
const idxCol = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
const cel = (corpo) => { const o = new Map(); for (const c of corpo.matchAll(/<c r=\"([A-Z]+)\d+\"(?:[^>]*t=\"([^\"]*)\")?[^>]*>([\s\S]*?)<\/c>/g)) { const [, col, tipo, d] = c; let v = ''; if (tipo === 'inlineStr') { v = [...d.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('') } else { const m = /<v>([\s\S]*?)<\/v>/.exec(d); if (m) v = tipo === 's' ? (comp[Number(m[1])] ?? '') : m[1] } if (v !== '') o.set(col, v.trim()) } return o }
const linhas = [...xml.matchAll(/<row[^>]*r=\"(\d+)\"[^>]*>([\s\S]*?)<\/row>/g)]
const hdr = cel(linhas[0][2])
const maxCol = Math.max(...[...hdr.keys()].map(colIdx))
const colunas = []
for (let i = 1; i <= maxCol; i++) { const L = idxCol(i); colunas.push(hdr.get(L) || '(coluna ' + L + ')') }
const iCod = colunas.indexOf('CodigoProduto'), iPreco = colunas.indexOf('PrecoVenda'), iNome = colunas.indexOf('Produto')
const parse = (v) => { const s = String(v || '').trim(); if (!s || s === '---') return null; if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.')); return Number(s) }

async function restTodos(path) { const o = []; for (let off = 0; ; off += 1000) { const r = await fetch(U + '/rest/v1/' + path + (path.includes('?') ? '&' : '?') + 'limit=1000&offset=' + off, { headers: H }); const j = await r.json(); if (!Array.isArray(j) || !j.length) break; o.push(...j); if (j.length < 1000) break } return o }

const produtos = await restTodos('produtos?select=id,codigo,ativo')
const codParaId = new Map()
for (const p of produtos) if (p.codigo) codParaId.set(String(p.codigo).trim(), { id: p.id, ativo: p.ativo !== false })

const tabelas = await restTodos('tabelas_preco?select=id,nome')
let TABELA_ID = tabelas.find((x) => String(x.nome).trim().toUpperCase() === 'VAREJO')?.id
console.log('tabela VAREJO existe:', !!TABELA_ID)

const itens = []
let comPreco = 0, inativos = 0, semMatch = 0, soma = 0
for (const l of linhas.slice(1)) {
  const c = cel(l[2]); if (c.size === 0) continue
  const cod = (c.get(idxCol(iCod + 1)) || '').trim()
  const nome = (c.get(idxCol(iNome + 1)) || '').trim()
  const preco = parse(c.get(idxCol(iPreco + 1)) || '')
  if (!cod) continue
  if (preco === null || preco <= 0) continue
  comPreco++
  const alvo = codParaId.get(cod)
  if (!alvo) { semMatch++; continue }
  if (!alvo.ativo) { inativos++; continue }
  soma += preco
  itens.push({ id: uuid5('tecnocell:itemtabela:VAREJO:' + alvo.id), tabela_id: TABELA_ID || uuid5('tecnocell:tabela:VAREJO'), produto_id: alvo.id, preco: Math.round(preco * 100) / 100 })
}
console.log('itens com PrecoVenda>0:', comPreco)
console.log('sem match por codigo:', semMatch, '| inativos pulados:', inativos)
console.log('a gravar:', itens.length, '| soma preco:', soma.toFixed(2))

if (DRY) { console.log('DRY RUN — nada gravado.'); process.exit(0) }

// cria a tabela VAREJO se nao existir
if (!TABELA_ID) {
  TABELA_ID = uuid5('tecnocell:tabela:VAREJO')
  const r = await fetch(U + '/rest/v1/tabelas_preco', { method: 'POST', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ id: TABELA_ID, nome: 'VAREJO', descricao: 'Tabela de varejo (cliente final)', ativa: true, usa_preco_custo: false }) })
  if (!r.ok) { const tt = await r.text(); throw new Error('HTTP ' + r.status + ' ' + tt.slice(0, 300)) }
  console.log('tabela VAREJO criada:', TABELA_ID)
}

let n = 0
for (let i = 0; i < itens.length; i += 500) {
  const chunk = itens.slice(i, i + 500)
  const r = await fetch(U + '/rest/v1/itens_tabela_preco?on_conflict=id', { method: 'POST', headers: { ...H, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk) })
  if (!r.ok) { const tt = await r.text(); throw new Error('HTTP ' + r.status + ' ' + tt.slice(0, 300)) }
  n += chunk.length
}
console.log('DONE: gravados', n)
