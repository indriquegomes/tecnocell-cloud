// carregar-pessoas.mjs — insere pessoas do SIGE que ainda NÃO existem no TecnoCell.
//
// Só INSERE (nunca atualiza nem apaga) — cadastro existente não é mexido.
// pessoas.id É o ObjectId do SIGE (cadastro importado 1:1), então casa por id.
// Serve pra trazer cliente novo do SIGE (ex.: os 3 que faltavam no baseline de vale).
//
// Uso: node scripts-sinc/carregar-pessoas.mjs [Clientes-*.json]

import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

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

async function idsExistentes() {
  const ids = new Set()
  const linhas = await restTodos('pessoas?select=id')
  for (const l of linhas) if (l.id) ids.add(l.id)
  return ids
}

async function insert(linhas) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/pessoas', {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(linhas),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' no insert de ' + linhas.length)
}

const main = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1) }

  let arquivo = process.argv[2]
  if (!arquivo) {
    const fs = (await readdir('.')).filter((f) => /^Clientes-.*\.json$/.test(f)).sort()
    arquivo = fs[fs.length - 1]
  }
  if (!arquivo) { console.error('Nenhum Clientes-*.json. Rode puxa-clientes.mjs antes.'); process.exit(1) }

  const clientes = JSON.parse(await readFile(arquivo, 'utf8'))
  if (!Array.isArray(clientes) || !clientes.length) { console.error(arquivo + ': não é um array de clientes.'); process.exit(1) }

  const ids = await idsExistentes()
  console.log('pessoas já no TecnoCell: ' + ids.size)

  const agora = new Date().toISOString()
  let novos = 0, existentes = 0, semNome = 0
  let lote = []
  const flush = async () => { if (!lote.length) return; await insert(lote); novos += lote.length; lote = [] }

  for (const c of clientes) {
    const id = c.Id
    if (!id) continue
    if (ids.has(id)) { existentes++; continue }
    const nome = String(c.NomeFantasia ?? c.RazaoSocial ?? '').trim()
    if (!nome) { semNome++; continue }
    lote.push({
      id,
      nome,
      pessoa_fisica: c.PessoaFisica === true,
      cpf_cnpj: c.CNPJ_CPF || null,
    })
    ids.add(id)
    if (lote.length >= BATCH) await flush()
  }
  await flush()

  console.log('Arquivo:', arquivo, '(' + clientes.length + ' registros)')
  console.log('Novos inseridos:', novos, '| já existiam:', existentes, '| sem nome:', semNome)
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
