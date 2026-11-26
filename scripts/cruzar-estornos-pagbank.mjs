// ESTORNOS — PIX enviado do extrato × devolução/estorno do app. SÓ LÊ.
//
//   node --env-file=.env.local scripts/cruzar-estornos-pagbank.mjs "<csv do extrato>" [dias]
//
// Foco único: dinheiro que saiu para CLIENTE (reembolso de devolução / estorno de
// crédito). Fornecedor, folha, imposto, CDB e tarifa ficam de fora — eles têm
// outra régua e já são conferidos pelo fechamento.
//
// Três perguntas, nesta ordem:
//   A) PIX do extrato que casa com devolução do app  → estorno provado
//   B) PIX do extrato que NÃO casa                    → dinheiro saiu sem motivo no app
//   C) devolução paga no app que NÃO aparece no banco → pagamento fantasma
//
// Casa 1 PIX = 1 devolução e também 1 devolução = soma de 2 ou 3 PIX (reembolso
// partido em duas transferências, que é comum quando o limite do PIX do dia bate).
import fs from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const arquivo = process.argv[2]
if (!arquivo) { console.error('uso: scripts/cruzar-estornos-pagbank.mjs "<csv do extrato>" [dias]'); process.exit(1) }
const DIAS = Number(process.argv[3] ?? 3)
const h = { apikey: key, Authorization: `Bearer ${key}` }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const diaDe = (iso) => String(iso ?? '').slice(0, 10)
const diffDias = (a, b) => (a && b ? Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000) : 999)

// ---------- extrato: só PIX enviado ----------
const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter((l) => l.trim())
const cab = linhas.shift().split(';').map((c) => norm(c))
const iData = cab.indexOf('DATA'), iTipo = cab.indexOf('TIPO'), iDesc = cab.indexOf('DESCRICAO'), iValor = cab.indexOf('VALOR')
const pixEnviado = linhas.map((l) => {
  const c = l.split(';')
  const valor = Number(String(c[iValor] ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const [dia, mes, ano] = String(c[iData] ?? '').split('/')
  return { tipo: (c[iTipo] ?? '').trim(), desc: (c[iDesc] ?? '').trim(), valor: -valor, dia: `${ano}-${mes}-${dia}` }
}).filter((m) => m.valor > 0 && /Pix enviado|QR Code Pix enviado/i.test(m.tipo))
const desde = pixEnviado[0].dia, ate = pixEnviado[pixEnviado.length - 1].dia
const soma = (lista, campo = 'valor') => lista.reduce((s, m) => s + Number(m[campo] ?? 0), 0)

console.log(`\n=== EXTRATO: PIX ENVIADO ${pixEnviado.length} · ${brl(soma(pixEnviado))} (${desde} a ${ate}) ===`)

// ---------- app: devolução/estorno pago ----------
const q = new URLSearchParams({
  select: 'id,valor,status,descricao,pessoa_nome,forma_pagamento,data_pagamento,data_vencimento,devolucao_id',
  tipo: 'eq.pagar', status: 'eq.pago',
  data_pagamento: `gte.${desde}`,
  or: '(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)',
  order: 'data_pagamento', limit: '2000',
})
const app = await (await fetch(`${url}/rest/v1/lancamentos?${q}&data_pagamento=lte.${ate}T23:59:59`, { headers: h })).json()
console.log(`=== APP: devolução/estorno pago ${app.length} · ${brl(soma(app))} ===`)

// ---------- A) casamento 1:1 ----------
const usadosApp = new Set()
const casados = []
for (const m of pixEnviado) {
  const achou = app.find((l) => !usadosApp.has(l.id) && Math.abs(Number(l.valor) - m.valor) < 0.011 && diffDias(diaDe(l.data_pagamento), m.dia) <= DIAS)
  if (achou) { usadosApp.add(achou.id); casados.push({ pix: m, app: achou }) }
}
// ---------- A2) uma devolução paga em 2 ou 3 PIX ----------
const pixSobrando = pixEnviado.filter((m) => !casados.some((c) => c.pix === m))
const appSobrando = app.filter((l) => !usadosApp.has(l.id))
const partidos = []
for (const l of appSobrando) {
  for (let i = 0; i < pixSobrando.length; i++) {
    for (let j = i + 1; j < pixSobrando.length; j++) {
      const a = pixSobrando[i], b = pixSobrando[j]
      if (a.parcial || b.parcial) continue
      if (Math.abs(a.valor + b.valor - Number(l.valor)) < 0.011 && diffDias(a.dia, diaDe(l.data_pagamento)) <= DIAS) {
        a.parcial = b.parcial = true
        usadosApp.add(l.id)
        partidos.push({ pixes: [a, b], app: l })
      }
    }
  }
}
const orfaosExtrato = pixEnviado.filter((m) => !casados.some((c) => c.pix === m) && !m.parcial)
const semExtrato = app.filter((l) => !usadosApp.has(l.id))

console.log(`\n=== A) ESTORNO PROVADO (PIX no banco + conta no app): ${casados.length} · ${brl(soma(casados.map((c) => c.pix)))} ===`)
for (const c of casados.sort((x, y) => x.pix.dia.localeCompare(y.pix.dia))) {
  console.log(`  ✔ ${c.pix.dia} · ${brl(c.pix.valor)} · ${(c.app.pessoa_nome ?? c.app.descricao ?? '').slice(0, 40)} · app:${diaDe(c.app.data_pagamento)}`)
}
if (partidos.length) {
  console.log(`\n=== A2) devolução paga em 2 PIX: ${partidos.length} ===`)
  for (const p of partidos) console.log(`  ✔ ${p.pixes.map((x) => brl(x.valor) + ' ' + x.dia).join(' + ')} = ${brl(p.app.valor)} · ${p.app.pessoa_nome ?? p.app.descricao}`)
}

console.log(`\n=== B) PIX SAIU E NÃO ACHEI ESTORNO NO APP: ${orfaosExtrato.length} · ${brl(soma(orfaosExtrato))} ===`)
for (const m of orfaosExtrato.sort((a, b) => a.dia.localeCompare(b.dia))) console.log(`  ✖ ${m.dia} · ${brl(m.valor)} · ${m.desc.slice(0, 50)} · ${m.tipo}`)

console.log(`\n=== C) ESTORNO PAGO NO APP SEM PIX NO BANCO: ${semExtrato.length} · ${brl(soma(semExtrato))} ===`)
for (const l of semExtrato.sort((a, b) => diaDe(a.data_pagamento).localeCompare(diaDe(b.data_pagamento)))) {
  const fora = /fora/i.test(String(l.forma_pagamento ?? '')) ? ' · ⚠️ fora do app' : ''
  console.log(`  ✖ ${diaDe(l.data_pagamento)} · ${brl(Number(l.valor))} · ${(l.pessoa_nome ?? l.descricao ?? '').slice(0, 40)}${fora}`)
}

console.log(`\n=== RESUMO (só estorno) ===`)
console.log(`  provado no banco:     ${casados.length + partidos.length} contas`)
console.log(`  PIX sem estorno:      ${orfaosExtrato.length} · ${brl(soma(orfaosExtrato))}`)
console.log(`  estorno sem PIX:      ${semExtrato.length} · ${brl(soma(semExtrato))}`)
