// Carregador de produtos (Fase 2) — lê Produtos-*.json (puxa-produtos.mjs) e
// faz UPSERT em "produtos". Casa por CodigoNFe -> produtos.codigo. Produto novo
// ganha UUID. NUNCA apaga. Idempotente (on conflict id).
//
// Uso: node scripts-sinc/carregar-produtos.mjs [Produtos-*.json]

import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

// De-para de campos do /v3/produtos/produtos -> produtos.
const CAMPOS = { codigo: 'CodigoNFe', nome: 'Nome', preco: 'PrecoVenda', precoCusto: 'PrecoCusto', marca: 'Marca', modelo: 'Modelo', ean: 'EAN_NFe', prateleira: 'Prateleira', unidade: 'Unidade', inativo: 'CadastroInativo' }

const BATCH = 500
const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const rest = async (path) => {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY },
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + path)
  return r.json()
}

async function mapaCodigoParaId() {
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

async function upsert(linhas) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/produtos?on_conflict=id', {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(linhas),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' no upsert de ' + linhas.length + ' produtos')
}

const main = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Faltam credenciais do Supabase (.env.local).'); process.exit(1) }

  let arquivo = process.argv[2]
  if (!arquivo) {
    const fs = (await readdir('.')).filter((f) => /^Produtos-.*\.json$/.test(f)).sort()
    arquivo = fs[fs.length - 1]
  }
  if (!arquivo) { console.error('Nenhum Produtos-*.json.'); process.exit(1) }

  const lista = JSON.parse(await readFile(arquivo, 'utf8'))
  if (!Array.isArray(lista) || !lista.length) { console.error(arquivo + ': não é array.'); process.exit(1) }

  const mapa = await mapaCodigoParaId()
  console.log('produtos existentes com codigo:', mapa.size)

  let atualizados = 0
  let novos = 0
  let pulados = 0
  let lote = []
  const flush = async () => { if (!lote.length) return; await upsert(lote); lote = [] }

  for (const l of lista) {
    const codigo = String(l[CAMPOS.codigo] ?? '').trim()
    const nome = String(l[CAMPOS.nome] ?? '').trim()
    if (!codigo || !nome) { pulados++; continue }
    const id = mapa.get(codigo) || randomUUID()
    if (mapa.has(codigo)) atualizados++; else novos++
    lote.push({
      id, codigo, nome,
      preco: num(l[CAMPOS.preco]) ?? 0,
      preco_custo: num(l[CAMPOS.precoCusto]) ?? 0,
      marca: String(l[CAMPOS.marca] ?? '').trim() || null,
      modelo: String(l[CAMPOS.modelo] ?? '').trim() || null,
      ean: String(l[CAMPOS.ean] ?? '').trim() || null,
      prateleira: String(l[CAMPOS.prateleira] ?? '').trim() || null,
      unidade: String(l[CAMPOS.unidade] ?? '').trim() || 'UN',
      ativo: !(l[CAMPOS.inativo] === true),
    })
    if (lote.length >= BATCH) await flush()
  }
  await flush()

  console.log('Arquivo:', arquivo, '(' + lista.length + ' produtos)')
  console.log('Atualizados:', atualizados, '| novos:', novos, '| pulados (sem codigo/nome):', pulados)
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
