// carregar-fiados.mjs — aplica o baseline de fiado (crediário) SIGE -> TecnoCell.
//
// Lê o Crediario-*.json (puxa-crediario.mjs) e faz UPSERT em "lancamentos".
// Só entra lançamento de fiado: ClienteID não nulo (dívida de cliente).
// Id determinístico (uuid v5 de IdLancamento ou EmpresaID+CodigoSequencial),
// então re-rodar atualiza em vez de duplicar. NUNCA apaga (on conflict id).
//
// Uso: node scripts-sinc/carregar-fiados.mjs [Crediario-*.json]

import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

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
const BATCH = 500

// uuid v5 determinístico: mesma semente -> mesmo id (idempotência de verdade).
function uuidFiado(seed) {
  const h = createHash('sha1').update('tecnocell:fiado:' + seed).digest()
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

// "31/08/2026 - 17:44" ou "31/08/2026" -> ISO com fuso de São Paulo (-03:00).
const brParaIso = (v) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{2}):(\d{2}))?$/.exec(String(v ?? '').trim())
  if (!m) return null
  const [, dd, mm, aaaa, hh = '00', mi = '00'] = m
  return `${aaaa}-${mm}-${dd}T${hh}:${mi}:00-03:00`
}

async function upsert(linhas) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/lancamentos?on_conflict=id', {
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
    const fs = (await readdir('.')).filter((f) => /^Crediario-.*\.json$/.test(f)).sort()
    arquivo = fs[fs.length - 1]
  }
  if (!arquivo) { console.error('Nenhum Crediario-*.json. Passe o caminho do arquivo.'); process.exit(1) }

  const linhas = JSON.parse(await readFile(arquivo, 'utf8'))
  if (!Array.isArray(linhas) || !linhas.length) { console.error(arquivo + ': não é um array de fiados.'); process.exit(1) }

  const agora = new Date().toISOString()
  let ok = 0
  let semCliente = 0
  let semVencimento = 0
  let lote = []
  const flush = async () => { if (!lote.length) return; await upsert(lote); ok += lote.length; lote = [] }

  for (const l of linhas) {
    const clienteID = pega(l, 'ClienteID', 'clienteID', 'ClienteId')
    const cliente = String(pega(l, 'Cliente', 'cliente') ?? '').trim()
    if (!clienteID && !cliente) { semCliente++; continue }
    const codigo = num(pega(l, 'CodigoSequencial', 'codigoSequencial'))
    const empresa = String(pega(l, 'EmpresaID', 'empresaID', 'EmpresaId') ?? '').trim()
    const seed = pega(l, 'IdLancamento', 'idLancamento', 'Id', 'id')
      ?? ((empresa && codigo) ? empresa + ':' + codigo : null)
      ?? (codigo !== null ? String(codigo) : null)
      ?? String(clienteID)
    const valor = num(pega(l, 'ValorFaltante', 'valorFaltante')) ?? num(pega(l, 'Valor', 'valor')) ?? 0
    const vencimento = brParaIso(pega(l, 'DataVencimento', 'dataVencimento'))
    if (!vencimento) semVencimento++
    const pago = pega(l, 'Pago', 'pago') === true

    lote.push({
      id: uuidFiado(String(seed)),
      codigo: codigo !== null && Number.isInteger(codigo) ? codigo : null,
      descricao: 'Fiado #' + (pega(l, 'CodVenda', 'codVenda') ?? codigo ?? seed),
      valor: Math.round(valor * 100) / 100,
      tipo: 'receber',
      status: pago ? 'pago' : 'pendente',
      data_vencimento: vencimento,
      pessoa_nome: cliente || null,
      updated_at: agora,
    })
    if (lote.length >= BATCH) await flush()
  }
  await flush()

  console.log('Arquivo:', arquivo, '(' + linhas.length + ' fiados)')
  console.log('Upsert:', ok, 'linhas | sem cliente:', semCliente, '| sem vencimento:', semVencimento)
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
