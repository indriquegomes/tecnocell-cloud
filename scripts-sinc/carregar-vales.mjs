// carregar-vales.mjs — baseline de vale-crédito SIGE -> TecnoCell (creditos_clientes).
//
// Lê o Vales-*.json (puxa-vale.mjs) e, pra cada cliente com SaldoValeCredito
// > 0, garante que o saldo no TecnoCell bata com o SIGE. Casa o cliente por ID:
// pessoas.id É o ObjectId do SIGE (cadastro importado 1:1).
//
// Como creditos_clientes é RAZÃO (soma de linhas), a baseline é UMA linha de ajuste
// por cliente, com id determinístico (uuid v5 do id do cliente). O valor da linha é o
// DELTA: saldoSIGE - (soma das outras linhas do cliente). Assim:
//   - re-rodar não duplica (on conflict id atualiza);
//   - se o cliente já tiver movimentos reais (devolução/venda de teste), o delta só
//     completa o que falta — nunca soma em cima.
// NUNCA apaga. tipo = 'credito' se falta saldo, 'uso' se sobra.
//
// Uso: node scripts-sinc/carregar-vales.mjs [Vales-*.json]

import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

function envLocal() {
  try {
    const out = {}
    const txt = readFileSync('.env.local', 'utf8').replace(/^\ufeff/, '')
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
const BATCH = 500

// uuid v5 determinístico (namespace próprio do vale, separado do fiado).
function uuidVale(seed) {
  const h = createHash('sha1').update('tecnocell:vale:' + seed).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.toString('hex')
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20, 32)
}

const pega = (o, ...ks) => { for (const k of ks) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null }

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const saldoSige = (c) => num(pega(c, 'SaldoValeCredito', 'saldoValeCredito', 'ValeCredito', 'valeCredito', 'SaldoVale')) ?? 0

const H = { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY }

const rest = async (path) => {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: H })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + path)
  return r.json()
}

const restTodos = async (path) => {
  const out = []
  for (let offset = 0;; offset += 1000) {
    const lote = await rest(path + (path.includes('?') ? '&' : '?') + 'limit=1000&offset=' + offset)
    out.push(...lote)
    if (lote.length < 1000) return out
  }
}

// Set dos ids de pessoas do TecnoCell. pessoas.id É o ObjectId do SIGE (1:1).
async function mapaPessoasIds() {
  const ids = new Set()
  const linhas = await restTodos('pessoas?select=id')
  for (const l of linhas) if (l.id) ids.add(l.id)
  return ids
}

// saldo atual do cliente, EXCLUINDO a linha de baseline (id determinístico).
async function saldoSemBaseline(pessoaId, baselineId) {
  const linhas = await restTodos('creditos_clientes?select=id,tipo,valor&pessoa_id=eq.' + pessoaId)
  return linhas
    .filter((x) => x.id !== baselineId)
    .reduce((s, x) => s + ((x.tipo === 'uso' || x.tipo === 'estorno') ? -Number(x.valor) : Number(x.valor)), 0)
}

async function upsert(linhas) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/creditos_clientes?on_conflict=id', {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(linhas),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' no upsert de ' + linhas.length + ' linhas')
}

const main = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.'); process.exit(1) }

  let arquivo = process.argv[2]
  if (!arquivo) {
    const fs = (await readdir('.')).filter((f) => /^(Clientes|Vales)-.*\.json$/.test(f)).sort()
    arquivo = fs[fs.length - 1]
  }
  if (!arquivo) { console.error('Nenhum Vales-*.json. Rode puxa-vale.mjs antes.'); process.exit(1) }

  const clientes = JSON.parse(await readFile(arquivo, 'utf8'))
  if (!Array.isArray(clientes) || !clientes.length) { console.error(arquivo + ': não é um array de clientes.'); process.exit(1) }

  const idsPessoas = await mapaPessoasIds()
  console.log('pessoas no TecnoCell: ' + idsPessoas.size)

  const agora = new Date().toISOString()
  let ok = 0
  let semVale = 0
  let semPessoa = 0
  let lote = []
  const flush = async () => { if (!lote.length) return; await upsert(lote); ok += lote.length; lote = [] }

  for (const c of clientes) {
    const sige = saldoSige(c)
    if (sige <= 0) { semVale++; continue }

    const clienteId = pega(c, 'Id', 'id', 'ClienteID', 'clienteID')
    const pessoaId = clienteId ? String(clienteId) : null
    if (!pessoaId || !idsPessoas.has(pessoaId)) { semPessoa++; continue }

    const baselineId = uuidVale(pessoaId)
    const atual = await saldoSemBaseline(pessoaId, baselineId)
    const delta = Math.round((sige - atual) * 100) / 100
    if (Math.abs(delta) < 0.005) continue // já bate

    lote.push({
      id: baselineId,
      pessoa_id: pessoaId,
      pessoa_nome: String(pega(c, 'Nome', 'nome', 'Cliente', 'cliente') ?? '').trim() || 'Cliente SIGE',
      valor: Math.abs(delta),
      tipo: delta > 0 ? 'credito' : 'uso',
      descricao: 'Baseline vale SIGE',
      created_at: agora,
    })
    if (lote.length >= BATCH) await flush()
  }
  await flush()

  console.log('Arquivo:', arquivo, '(' + clientes.length + ' clientes)')
  console.log('Baseline aplicada:', ok, '| sem vale:', semVale, '| sem pessoa (id fora do TecnoCell):', semPessoa)
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
