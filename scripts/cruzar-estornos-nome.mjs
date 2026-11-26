import fs from 'node:fs'
import { mesmoNome, nomeDoLancamento } from './lib-nome-extrato.mjs'
const u = process.env.NEXT_PUBLIC_SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY
const h = { apikey: k, Authorization: `Bearer ${k}` }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const get = async (p) => (await fetch(`${u}/rest/v1/${p}`, { headers: h })).json()
const arquivo = process.argv[2]
const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter((l) => l.trim())
const cab = linhas.shift().split(';').map((c) => c.trim().toUpperCase())
const iD = cab.indexOf('DATA'), iT = cab.indexOf('TIPO'), iDe = cab.indexOf('DESCRICAO'), iV = cab.indexOf('VALOR')
const pix = linhas.map((l) => {
  const c = l.split(';')
  const valor = Number(String(c[iV] ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const [d, m, a] = String(c[iD] ?? '').split('/')
  return { tipo: (c[iT] ?? '').trim(), nome: (c[iDe] ?? '').trim(), valor: -valor, dia: `${a}-${m}-${d}` }
}).filter((m) => m.valor > 0 && /Pix enviado|QR Code Pix enviado/i.test(m.tipo))

const app = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,forma_pagamento,conta_id,data_pagamento,devolucao_id&tipo=eq.pagar&status=eq.pago&or=(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)&limit=2000`)
const dia = (x) => String(x ?? '').slice(0, 10)
const dif = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000)

const semNome = [], comNome = []
const usados = new Set()
for (const m of pix) {
  const cand = app.find((l) => !usados.has(l.id) && Math.abs(Number(l.valor) - m.valor) < 0.011 && dif(dia(l.data_pagamento), m.dia) <= 3 && mesmoNome(m.nome, nomeDoLancamento(l)))
  if (cand) { usados.add(cand.id); comNome.push({ m, l: cand }) }
  else {
    const soValor = app.filter((l) => !usados.has(l.id) && Math.abs(Number(l.valor) - m.valor) < 0.011 && dif(dia(l.data_pagamento), m.dia) <= 3)
    semNome.push({ m, soValor })
  }
}
console.log(`\n=== COM NOME CASANDO (banco + app): ${comNome.length} · ${brl(comNome.reduce((s, x) => s + x.m.valor, 0))} ===`)
for (const x of comNome.sort((a, b) => a.m.dia.localeCompare(b.m.dia))) console.log(`  ✔ ${x.m.dia} · ${brl(x.m.valor)} · ${x.m.nome.slice(0, 40)} → ${nomeDoLancamento(x.l).slice(0, 34)}`)
console.log(`\n=== VALOR BATE MAS O NOME NÃO: ${semNome.length} · ${brl(semNome.reduce((s, x) => s + x.m.valor, 0))} ===`)
for (const x of semNome.sort((a, b) => a.m.dia.localeCompare(b.m.dia))) {
  console.log(`  ✖ ${x.m.dia} · ${brl(x.m.valor)} · banco: ${x.m.nome.slice(0, 40)}`)
  for (const l of x.soValor.slice(0, 3)) console.log(`       app (mesmo valor/data): ${nomeDoLancamento(l).slice(0, 40)} · ${l.forma_pagamento} · ${dia(l.data_pagamento)}`)
}
