// CONSERTO — devolução do SUPERCELL (VITOR PORTO FIGUEIRA), R$ 210,00 (venda #14058).
//
//   node --env-file=.env.local scripts/consertar-supercell-210.mjs            (ensaio)
//   node --env-file=.env.local scripts/consertar-supercell-210.mjs --aplicar  (grava)
//   node --env-file=.env.local scripts/consertar-supercell-210.mjs --desfazer (volta)
//
// A venda #14058 (R$ 357,00) voltou em três pedaços: R$ 210,00 (FRONTAL XIAOMI NOTE
// 13 PRO, estoque ok), R$ 50,00 e R$ 45,00 (os dois viraram vale). O pedaço de
// R$ 210,00 foi reembolsado por PIX no PagBank — comprovante no grupo, recebedor
// VITOR PORTO FIGUEIRA — mas a conta a pagar ficou sem vínculo e a devolução diz
// `sem_reembolso` (mantendo a receita de novembro cheia).
import fs from 'node:fs'
import path from 'node:path'

const CONTA_PREFIXO = 'ec0b25b4'
const VENDA_NUMERO = 14058
const VALOR = 210

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const desfazer = process.argv.includes('--desfazer')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const contas = await get(`lancamentos?select=id,valor,descricao,forma_pagamento,conta_id,devolucao_id,status&tipo=eq.pagar&descricao=ilike.*SUPERCELL*&valor=eq.${VALOR}`)
const conta = contas.find((c) => c.id.startsWith(CONTA_PREFIXO))
const venda = (await get(`vendas?select=id,numero,total&numero=eq.${VENDA_NUMERO}`))[0]
const devs = await get(`devolucoes?select=id,valor_total,tipo_credito,reembolsos,status&venda_id=eq.${venda?.id}`)
const dev = devs.find((d) => Math.abs(Number(d.valor_total) - VALOR) < 0.011)
if (!conta || !dev) { console.error('não achei a conta ou a devolução'); process.exit(1) }

console.log(`\nANTES`)
console.log(`  conta     : ${brl(conta.valor)} · ${conta.status} · forma='${conta.forma_pagamento}' · conta=${conta.conta_id ? 'PagBank' : 'NENHUMA'} · devolucao_id=${conta.devolucao_id ?? 'NENHUMA'}`)
console.log(`  venda     : #${venda.numero} · ${brl(venda.total)} · outras devoluções: ${devs.filter((d) => d.id !== dev.id).map((d) => brl(d.valor_total) + ' ' + d.tipo_credito).join(' · ')}`)
console.log(`  devolução : ${dev.id.slice(0, 8)} · ${brl(dev.valor_total)} · ${dev.tipo_credito} · reembolsos=${JSON.stringify(dev.reembolsos)}`)

if (!aplicar && !desfazer) {
  console.log(`\n(ensaio: nada gravado. --aplicar conserta · --desfazer volta)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `conserto-supercell-210-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  conta_id: conta.id, conta_antes: { devolucao_id: conta.devolucao_id },
  devolucao_id: dev.id, devolucao_antes: { tipo_credito: dev.tipo_credito, reembolsos: dev.reembolsos },
  obs: 'venda #14058 voltou em 210 + 50 + 45; só o pedaço de 210 foi pago em PIX',
}, null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

const corpoConta = desfazer
  ? { devolucao_id: null }
  : { devolucao_id: dev.id, updated_at: new Date().toISOString() }
const corpoDev = desfazer
  ? { tipo_credito: 'sem_reembolso', reembolsos: [{ tipo: 'sem_reembolso', valor: Number(dev.valor_total) }] }
  : { tipo_credito: 'pix', reembolsos: [{ tipo: 'pix', valor: Number(dev.valor_total) }] }

const r1 = await fetch(`${url}/rest/v1/lancamentos?id=eq.${conta.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoConta) })
const r2 = await fetch(`${url}/rest/v1/devolucoes?id=eq.${dev.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoDev) })

const dc = (await get(`lancamentos?select=valor,status,forma_pagamento,conta_id,devolucao_id&id=eq.${conta.id}`))[0]
const dd = (await get(`devolucoes?select=valor_total,tipo_credito,reembolsos&id=eq.${dev.id}`))[0]
console.log(`\nDEPOIS (${desfazer ? 'desfeito' : 'consertado'}) — conta ok=${r1.ok} · devolução ok=${r2.ok}`)
console.log(`  conta     : ${brl(dc.valor)} · ${dc.status} · forma='${dc.forma_pagamento}' · conta=${dc.conta_id ? 'PagBank' : 'NENHUMA'} · devolucao_id=${dc.devolucao_id ?? 'NENHUMA'}`)
console.log(`  devolução : ${brl(dd.valor_total)} · ${dd.tipo_credito} · reembolsos=${JSON.stringify(dd.reembolsos)}`)
