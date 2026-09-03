// Reconciliação (Fechamento do Dia) — compara o SIGE (JSONs puxados) com o
// TecnoCell (banco) e aponta divergência. Estoque e fiado.
//
// Uso: node scripts-sinc/reconciliar.mjs [Estoques-*.json] [Crediario-*.json]

import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const ENV_PATH = new URL('../.env.local', import.meta.url)
function envLocal() {
  try {
    const out = {}
    const txt = readFileSync(ENV_PATH, 'utf8').replace(/^\ufeff/, '')
    for (const linha of txt.split('\n')) { const m = linha.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2].trim() }
    return out
  } catch { return {} }
}
const env = envLocal()
const BASE = env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, authorization: 'Bearer ' + KEY }

const rest = async (path) => {
  const r = await fetch(BASE + '/rest/v1/' + path, { headers: H })
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

// grava o resultado no sinc_reconciliacao (o painel lê daqui)
async function gravar(dominio, sige, tecno) {
  const diff = Math.round((tecno - sige) * 100) / 100
  const status = Math.abs(diff) < 0.01 ? 'ok' : 'divergente'
  await fetch(BASE + '/rest/v1/sinc_reconciliacao', {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ dominio, loja: 'todas', total_sige: sige, total_tecnocell: tecno, divergencia: diff, status }),
  })
}

const RE = /<strong>([^<]+)<\/strong>\s*:\s*<br\/>TOTAL\s*\([^)]*\)\s*\|\s*RESERVADO\s*\([^)]*\)\s*\|\s*DISPONÍVEL\s*\(([^)]*)\)/g
function saldosDoProduto(html) {
  const out = {}
  if (!html) return out
  let m
  while ((m = RE.exec(html)) !== null) {
    const nome = m[1].trim().toUpperCase()
    const val = Number(String(m[2]).trim().replace(',', '.'))
    if (nome && Number.isFinite(val)) out[nome] = val
  }
  return out
}

const achar = async (padrao) => {
  const fs = (await readdir('.')).filter((f) => new RegExp(padrao).test(f)).sort()
  return fs[fs.length - 1]
}

const main = async () => {
  const estoqueArq = process.argv[2] || (await achar('^Estoques-.*\\.json$'))
  const credArq = process.argv[3] || (await achar('^Crediario-.*\\.json$'))

  // ---- ESTOQUE ----
  if (estoqueArq) {
    const linhas = JSON.parse(await readFile(estoqueArq, 'utf8'))
    const sige = {}
    for (const l of linhas) {
      for (const [nome, qtd] of Object.entries(saldosDoProduto(l.Saldos))) sige[nome] = (sige[nome] || 0) + qtd
    }
    const depositos = await rest('depositos?select=id,nome')
    const nomeParaId = Object.fromEntries(depositos.map((d) => [String(d.nome).trim().toUpperCase(), d.id]))

    console.log('=== ESTOQUE (DISPONÍVEL) ===')
    let sigeTotal = 0, tecTotal = 0
    for (const [nome, qtd] of Object.entries(sige)) {
      const depId = nomeParaId[nome]
      if (!depId) continue
      const tec = await restTodos('estoque?select=quantidade&deposito_id=eq.' + depId)
      const tecQtd = tec.reduce((s, x) => s + (Number(x.quantidade) || 0), 0)
      sigeTotal += qtd; tecTotal += tecQtd
      const diff = Math.round((tecQtd - qtd) * 1000) / 1000
      const ok = Math.abs(diff) < 0.001 ? 'OK' : 'DIVERGÊNCIA'
      console.log(('' + nome).padEnd(30) + ' SIGE ' + qtd + ' | TecnoCell ' + tecQtd + ' | ' + (diff >= 0 ? '+' : '') + diff + ' | ' + ok)
    }
    console.log('TOTAL: SIGE ' + sigeTotal + ' | TecnoCell ' + tecTotal + ' | diff ' + (tecTotal - sigeTotal))
    await gravar('estoque', sigeTotal, tecTotal)
  }

  // ---- FIADO ----
  if (credArq) {
    const linhas = JSON.parse(await readFile(credArq, 'utf8'))
    const sigeFiado = linhas.reduce((s, l) => s + (Number(l.ValorFaltante ?? l.Valor ?? 0) || 0), 0)
    const tec = await restTodos('lancamentos?select=valor&tipo=eq.receber&status=eq.pendente')
    const tecFiado = tec.reduce((s, x) => s + (Number(x.valor) || 0), 0)
    console.log('\n=== FIADO (a receber pendente) ===')
    console.log('SIGE ' + sigeFiado + ' | TecnoCell ' + tecFiado + ' | diff ' + (tecFiado - sigeFiado))
    await gravar('fiado', sigeFiado, tecFiado)
  }
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
