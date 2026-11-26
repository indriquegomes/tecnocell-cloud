// DEVOLUÇÃO "SEM REEMBOLSO" QUE NA VERDADE FOI PAGA EM PIX.
//
//   node --env-file=.env.local scripts/consertar-reembolso-devolucao.mjs            (ensaio)
//   node --env-file=.env.local scripts/consertar-reembolso-devolucao.mjs --aplicar  (grava)
//   node --env-file=.env.local scripts/consertar-reembolso-devolucao.mjs --desfazer (volta)
//
// Por que mexer: o DRE só derruba a receita quando o dinheiro/crédito voltou ao
// cliente (`docs/mapa/regra-perda-e-devolucao.md`). Devolução marcada
// `sem_reembolso` mantém a receita cheia — mas o PIX do PagBank prova que o
// dinheiro saiu. Nas 6 abaixo, o PIX existe, o comprovante existe e a conta a pagar
// está paga em PIX: falta só a devolução dizer a verdade.
//
// O que muda: `tipo_credito` sem_reembolso → pix · `reembolsos` [{sem_reembolso, X}]
// → [{pix, X}]. Nada mais: valor, itens, estoque e crédito ficam como estão.
import fs from 'node:fs'
import path from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const desfazer = process.argv.includes('--desfazer')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

// (nome do cliente no app, valor da devolução) — as 6 que o PIX provou e a devolução
// ainda dizia "sem reembolso".
const alvosProcurados = [
  ['Lucar Gabriel', 229],
  ['ARTHUR DIAS', 57],
  ['Vitor da Silva Costa', 224],
  ['ANDERSON XAVIER', 21],
  ['Bruno Delgado', 295],
  ['Diego Santos', 77],
]

const alvos = []
for (const [nome, valor] of alvosProcurados) {
  const devs = await get(`devolucoes?select=id,pessoa_nome,valor_total,tipo_credito,reembolsos,venda_id&pessoa_nome=ilike.*${encodeURIComponent(nome)}*&valor_total=eq.${valor}&created_at=gte.2026-11-01&limit=3`)
  if (!devs.length) { console.log(`  ${nome} ${valor}: não achei`); continue }
  if (devs.length > 1) { console.log(`  ${nome} ${valor}: ${devs.length} devoluções — pulando`); continue }
  alvos.push(devs[0])
}

const paraConsertar = alvos.filter((d) => d.tipo_credito === 'sem_reembolso')
console.log(`\n=== DEVOLUÇÕES "sem_reembolso" COM PIX PAGO: ${paraConsertar.length} ===`)
for (const d of paraConsertar) console.log(`  ${brl(d.valor_total).padEnd(11)} · ${String(d.pessoa_nome).slice(0, 34).padEnd(34)} · ${d.tipo_credito} → pix`)
const total = paraConsertar.reduce((s, d) => s + Number(d.valor_total), 0)
console.log(`\n  total: ${brl(total)}  (é o tanto que a receita de novembro passa a descontar)`)

if (!aplicar && !desfazer) {
  console.log(`\n(ensaio: nada gravado. --aplicar conserta · --desfazer volta)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const backup = path.join(dir, `reembolso-devolucao-${Date.now()}.json`)
fs.writeFileSync(backup, JSON.stringify(paraConsertar.map((d) => ({ id: d.id, pessoa_nome: d.pessoa_nome, valor_total: d.valor_total, antes: { tipo_credito: d.tipo_credito, reembolsos: d.reembolsos } })), null, 2), 'utf8')
console.log(`\nbackup: ${backup}`)

let ok = 0
for (const d of paraConsertar) {
  const corpo = desfazer
    ? { tipo_credito: 'sem_reembolso', reembolsos: [{ tipo: 'sem_reembolso', valor: Number(d.valor_total) }] }
    : { tipo_credito: 'pix', reembolsos: [{ tipo: 'pix', valor: Number(d.valor_total) }] }
  const r = await fetch(`${url}/rest/v1/devolucoes?id=eq.${d.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpo) })
  if (r.ok) ok++
  else console.log(`  falhou ${d.id}: ${(await r.text()).slice(0, 120)}`)
}
console.log(`${desfazer ? 'desfeitas' : 'consertadas'}: ${ok} de ${paraConsertar.length}`)
