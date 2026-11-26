// SÓ OS ESTORNOS QUE CASARAM — e o que cada casamento diz do app. SÓ LÊ.
//
//   node --env-file=.env.local scripts/estornos-casados.mjs "<csv do extrato>" [dias]
//
// Três perguntas por casamento:
//   1. o dinheiro está na conta certa? (forma PIX + conta PagBank)
//   2. a data do app bate com o dia do PIX no banco?
//   3. a linha nasceu de devolução de verdade (devolucao_id)?
import fs from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const arquivo = process.argv[2]
if (!arquivo) { console.error('uso: scripts/estornos-casados.mjs "<csv>" [dias]'); process.exit(1) }
const DIAS = Number(process.argv[3] ?? 3)
const h = { apikey: key, Authorization: `Bearer ${key}` }
const PAGBANK = '24bff81f-9728-4e10-9b1b-9aad26a2952d'
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const diaDe = (iso) => String(iso ?? '').slice(0, 10)
const lag = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000)

const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter((l) => l.trim())
const cab = linhas.shift().split(';').map((c) => norm(c))
const iData = cab.indexOf('DATA'), iTipo = cab.indexOf('TIPO'), iDesc = cab.indexOf('DESCRICAO'), iValor = cab.indexOf('VALOR')
const pix = linhas.map((l) => {
  const c = l.split(';')
  const valor = Number(String(c[iValor] ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const [d, m, a] = String(c[iData] ?? '').split('/')
  return { tipo: (c[iTipo] ?? '').trim(), desc: (c[iDesc] ?? '').trim(), valor: -valor, dia: `${a}-${m}-${d}` }
}).filter((m) => m.valor > 0 && /Pix enviado|QR Code Pix enviado/i.test(m.tipo))

const app = await (await fetch(`${url}/rest/v1/lancamentos?select=id,valor,descricao,pessoa_nome,forma_pagamento,conta_id,data_pagamento,devolucao_id&tipo=eq.pagar&status=eq.pago&or=(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)&limit=2000`, { headers: h })).json()

const usados = new Set()
const pares = []
for (const m of pix) {
  const l = app.find((x) => !usados.has(x.id) && Math.abs(Number(x.valor) - m.valor) < 0.011 && Math.abs(lag(diaDe(x.data_pagamento), m.dia)) <= DIAS)
  if (l) { usados.add(l.id); pares.push({ pixes: [m], app: l }) }
}
// devolução paga em 2 PIX
for (const l of app.filter((x) => !usados.has(x.id))) {
  const livres = pix.filter((m) => !pares.some((p) => p.pixes.includes(m)))
  for (let i = 0; i < livres.length; i++) for (let j = i + 1; j < livres.length; j++) {
    const a = livres[i], b = livres[j]
    if (Math.abs(a.valor + b.valor - Number(l.valor)) < 0.011 && Math.abs(lag(diaDe(l.data_pagamento), a.dia)) <= DIAS) {
      usados.add(l.id); pares.push({ pixes: [a, b], app: l }); i = livres.length; break
    }
  }
}

const fora = [], semConta = [], contaErrada = [], semDevolucao = [], pontual = [], atrasado = []
for (const p of pares) {
  const l = p.app
  const ehFora = /fora/i.test(String(l.forma_pagamento ?? ''))
  const ehPix = /pix/i.test(String(l.forma_pagamento ?? ''))
  const d = lag(diaDe(l.data_pagamento), p.pixes[0].dia)
  if (ehFora) fora.push(p)
  if (!l.conta_id) semConta.push(p)
  if (l.conta_id && l.conta_id !== PAGBANK) contaErrada.push(p)
  if (!l.devolucao_id) semDevolucao.push(p)
  if (d === 0) pontual.push(p); else atrasado.push({ ...p, d })
  void ehPix
}

console.log(`\n=== CASADOS: ${pares.length} devoluções · ${pixesTotal(pares)} PIX · ${brl(pares.reduce((s, p) => s + p.pixes.reduce((x, y) => x + y.valor, 0), 0))} ===`)
console.log(`  forma "fora do app" (não baixa banco): ${fora.length} · ${brl(soma(fora))}`)
console.log(`  sem conta_id (não baixa banco):        ${semConta.length} · ${brl(soma(semConta))}`)
console.log(`  conta diferente do PagBank:            ${contaErrada.length}`)
console.log(`  sem devolucao_id (estorno de crédito): ${semDevolucao.length}`)
console.log(`  app no MESMO dia do banco:             ${pontual.length}`)
console.log(`  app em outro dia:                      ${atrasado.length} · atraso médio ${atrasado.length ? (atrasado.reduce((s, x) => s + Math.abs(x.d), 0) / atrasado.length).toFixed(1) : 0} dia(s)`)

console.log(`\n--- todos os casados ---`)
const ordenado = pares.sort((a, b) => a.pixes[0].dia.localeCompare(b.pixes[0].dia))
for (const p of ordenado) {
  const l = p.app
  const d = lag(diaDe(l.data_pagamento), p.pixes[0].dia)
  const marcas = []
  if (/fora/i.test(String(l.forma_pagamento ?? ''))) marcas.push('⚠️ fora do app')
  if (!l.conta_id) marcas.push('⚠️ sem conta')
  if (!l.devolucao_id) marcas.push('estorno de crédito')
  if (d !== 0) marcas.push(`app ${d > 0 ? '+' : ''}${d}d`)
  const pixTxt = p.pixes.map((x) => brl(x.valor)).join(' + ')
  console.log(`  ${p.pixes[0].dia} · ${pixTxt.padEnd(14)} · ${brl(Number(l.valor)).padEnd(11)} · ${String(l.pessoa_nome ?? l.descricao ?? '').slice(0, 30).padEnd(30)} ${marcas.join(' · ')}`)
}

function pixesTotal(ps) { return ps.reduce((s, p) => s + p.pixes.length, 0) }
function soma(ps) { return ps.reduce((s, p) => s + p.pixes.reduce((x, y) => x + y.valor, 0), 0) }
