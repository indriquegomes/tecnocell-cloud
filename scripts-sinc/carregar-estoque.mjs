// Fase 3 — carregador de baseline do estoque SIGE -> TecnoCell.
//
// Lê o JSON do ReportEstoques (puxa-relatorios.mjs Estoques) e faz UPSERT em
// "estoque". O saldo por depósito vem no campo "Saldos" como HTML:
//   <strong>NOME </strong>: <br/>TOTAL (X) | RESERVADO (Y) | DISPONÍVEL (Z) <br/>
// Usamos DISPONÍVEL (o que dá pra vender). Produto casa por "Codigo" ->
// produtos.codigo. Depósito casa por nome -> depositos.nome. Idempotente:
// on conflict (produto_id, deposito_id) atualiza quantidade. NUNCA apaga.
//
// Uso: node scripts-sinc/carregar-estoque.mjs [Estoques-*.json]

import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

// Lê .env.local automaticamente (pra não precisar copiar chave na mão).
function envLocal() {
  try {
    const out = {}
    const txt = readFileSync('.env.local', 'utf8')
    for (const linha of txt.split('\n')) {
      const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2].trim()
    }
    return out
  } catch { return {} }
}
const env = envLocal()
// .env.local tem prioridade (a variável de ambiente pode estar suja de sessão anterior).
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH = 500

const rest = async (path) => {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY },
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + path)
  return r.json()
}

async function mapaProdutos() {
  const m = new Map()
  let offset = 0
  for (;;) {
    const linhas = await rest('produtos?select=id,codigo&order=id&limit=1000&offset=' + offset)
    for (const l of linhas) if (l.codigo) m.set(String(l.codigo).trim(), l.id)
    if (linhas.length < 1000) break
    offset += linhas.length
  }
  return m
}

async function mapaDepositos() {
  const m = new Map()
  const linhas = await rest('depositos?select=id,nome')
  for (const l of linhas) m.set(String(l.nome).trim().toUpperCase(), l.id)
  return m
}

// Parseia o HTML do Saldos -> { NOME: disponivel }
const RE = /<strong>([^<]+)<\/strong>\s*:\s*<br\/>TOTAL\s*\([^)]*\)\s*\|\s*RESERVADO\s*\([^)]*\)\s*\|\s*DISPONÍVEL\s*\(([^)]*)\)/g
function parseSaldos(html) {
  const out = {}
  if (!html || typeof html !== 'string') return out
  let m
  while ((m = RE.exec(html)) !== null) {
    const nome = m[1].trim().toUpperCase()
    const val = Number(String(m[2]).trim().replace(',', '.'))
    if (nome && Number.isFinite(val)) out[nome] = val
  }
  return out
}

async function upsert(linhas) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/estoque?on_conflict=produto_id,deposito_id', {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(linhas),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' no upsert de ' + linhas.length + ' linhas')
}

const main = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.'); process.exit(1) }

  let arquivo = process.argv[2]
  if (!arquivo) {
    const fs = (await readdir('.')).filter((f) => /^Estoques-.*\.json$/.test(f)).sort()
    arquivo = fs[fs.length - 1]
  }
  if (!arquivo) { console.error('Nenhum Estoques-*.json. Passe o caminho do arquivo.'); process.exit(1) }

  const linhas = JSON.parse(await readFile(arquivo, 'utf8'))
  if (!Array.isArray(linhas) || !linhas.length) { console.error(arquivo + ': não é um array de linhas do ReportEstoques.'); process.exit(1) }

  const [produtos, depositos] = await Promise.all([mapaProdutos(), mapaDepositos()])
  console.log('produtos:', produtos.size, '| depósitos:', depositos.size)

  const agora = new Date().toISOString()
  let ok = 0
  let produtosPulados = 0
  let lote = []
  const flush = async () => { if (!lote.length) return; await upsert(lote); ok += lote.length; lote = [] }

  for (const l of linhas) {
    const codigo = String(l.Codigo ?? '').trim()
    const prodId = produtos.get(codigo)
    if (!prodId) { produtosPulados++; continue }
    const saldos = parseSaldos(l.Saldos)
    for (const [nome, qtd] of Object.entries(saldos)) {
      const depId = depositos.get(nome)
      if (!depId) continue // depósito que não existe aqui (ex.: MACAÉ)
      lote.push({ produto_id: prodId, deposito_id: depId, quantidade: qtd, updated_at: agora })
      if (lote.length >= BATCH) await flush()
    }
  }
  await flush()

  console.log('Arquivo:', arquivo, '(' + linhas.length + ' produtos)')
  console.log('Upsert:', ok, 'linhas | produtos sem código:', produtosPulados)
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
