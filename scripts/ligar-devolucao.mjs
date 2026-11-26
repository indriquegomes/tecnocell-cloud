// LIGA A CONTA A PAGAR À DEVOLUÇÃO QUE JÁ EXISTE. SÓ LÊ + grava o vínculo.
//
//   node --env-file=.env.local scripts/ligar-devolucao.mjs            (ensaio)
//   node --env-file=.env.local scripts/ligar-devolucao.mjs --aplicar  (grava)
//
// A conta "Devolução — FULANO (estorno de compra)" foi criada direto no Financeiro,
// sem `devolucao_id`. A devolução daquela venda existe (a peça voltou, o estoque foi
// mexido, o crédito nasceu) — só não está amarrada à conta que pagou o dinheiro.
//
// Este script grava `lancamentos.devolucao_id` = a devolução da venda, quando o
// valor da devolução é IGUAL ao da conta. Nada mais: não muda valor, status, forma,
// conta, reembolso nem tipo de crédito.
import fs from 'node:fs'
import path from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const dia = (x) => String(x ?? '').slice(0, 10)

const provas = await get(`pix_saidas?select=id,valor,dia,lancamento_id,extraido_raw&lancamento_id=not.is.null&limit=100`)
const comVenda = provas.filter((p) => p.extraido_raw?.venda_id)

const ligar = []
const pular = []
for (const p of comVenda) {
  const conta = (await get(`lancamentos?select=id,valor,descricao,devolucao_id,forma_pagamento,conta_id&id=eq.${p.lancamento_id}`))[0]
  if (!conta) continue
  if (conta.devolucao_id) { pular.push({ conta, motivo: 'já ligada' }); continue }
  const devs = await get(`devolucoes?select=id,valor_total,tipo_credito,status,pessoa_nome&venda_id=eq.${p.extraido_raw.venda_id}`)
  const igual = devs.filter((d) => Math.abs(Number(d.valor_total) - Number(conta.valor)) < 0.011)
  if (igual.length === 1) ligar.push({ conta, dev: igual[0], p, todas: devs })
  else pular.push({ conta, motivo: igual.length ? `${igual.length} devoluções com esse valor` : `devolução de valor diferente (${devs.map((d) => brl(d.valor_total)).join(', ') || 'nenhuma'})`, devs, p })
}

console.log(`\n=== PARA LIGAR (conta → devolução): ${ligar.length} ===`)
for (const x of ligar) {
  console.log(`  ${brl(x.conta.valor).padEnd(11)} · ${String(x.conta.descricao).slice(0, 42).padEnd(42)} → devolução ${x.dev.id.slice(0, 8)} (${x.dev.tipo_credito}, ${x.dev.status}) · venda #${x.p.extraido_raw.venda_numero}`)
}
console.log(`\n=== FORA: ${pular.length} ===`)
for (const x of pular) console.log(`  ${brl(x.conta.valor).padEnd(11)} · ${String(x.conta.descricao).slice(0, 42).padEnd(42)} — ${x.motivo}`)

if (!aplicar) {
  console.log(`\n(ensaio: nada gravado. --aplicar liga os ${ligar.length}.)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const backup = path.join(dir, `ligar-devolucao-${Date.now()}.json`)
fs.writeFileSync(backup, JSON.stringify(ligar.map((x) => ({ lancamento_id: x.conta.id, descricao: x.conta.descricao, valor: x.conta.valor, devolucao_id: x.dev.id, devolucao_valor: x.dev.valor_total, devolucao_tipo: x.dev.tipo_credito, antes: { devolucao_id: null } })), null, 2), 'utf8')
console.log(`\nbackup: ${backup}`)

let ok = 0
for (const x of ligar) {
  const r = await fetch(`${url}/rest/v1/lancamentos?id=eq.${x.conta.id}`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ devolucao_id: x.dev.id, updated_at: new Date().toISOString() }),
  })
  if (r.ok) ok++
  else console.log(`  falhou ${x.conta.id}: ${(await r.text()).slice(0, 120)}`)
}
console.log(`ligadas: ${ok} de ${ligar.length}`)
