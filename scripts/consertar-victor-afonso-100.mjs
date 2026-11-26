// CONSERTO — devolução do VICTOR AFONSO (VT CELL), R$ 100,00 (venda #12160).
//
//   node --env-file=.env.local scripts/consertar-victor-afonso-100.mjs            (ensaio)
//   node --env-file=.env.local scripts/consertar-victor-afonso-100.mjs --aplicar  (grava)
//   node --env-file=.env.local scripts/consertar-victor-afonso-100.mjs --desfazer (volta)
//
// A história que os dados contam, na ordem:
//   1. venda #11704 (05/11, R$ 100) → cliente devolveu → crédito de R$ 100 (07/11)
//   2. esse crédito foi USADO na venda #12160 ("Usado na venda #12160", 07/11)
//   3. venda #12160 (07/11, R$ 100) → devolvida também, registrada como
//      `sem_reembolso` — mas o PagBank mostra PIX de R$ 100 saindo em 07/11
//      (comprovante, recebedor "VICTOR AFONSO PACHECO VICENTE")
//   4. a conta a pagar "Devolução — Victor Afonso (estorno de compra)" R$ 100 está
//      paga em PIX na conta PagBank, sem vínculo com a devolução
//
// O que muda: a conta recebe `devolucao_id` da devolução da venda #12160, e essa
// devolução passa a dizer a verdade (`pix`, reembolso R$ 100).
//
// Não há pagamento em dobro: o crédito de R$ 100 foi usado na compra, não sacado.
import fs from 'node:fs'
import path from 'node:path'

const CONTA = 'b2e75e3c'          // prefixo do lançamento "Devolução — Victor Afonso"
const VENDA_NUMERO = 12160        // onde o crédito foi usado E que foi devolvida
const PAGBANK = '24bff81f-9728-4e10-9b1b-9aad26a2952d'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const desfazer = process.argv.includes('--desfazer')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const conta = (await get(`lancamentos?select=id,valor,descricao,forma_pagamento,conta_id,data_pagamento,devolucao_id,status&descricao=ilike.*Victor Afonso*&tipo=eq.pagar`))[0]
if (!conta) { console.error('não achei a conta do Victor Afonso'); process.exit(1) }
const venda = (await get(`vendas?select=id,numero,total,pessoa_id&numero=eq.${VENDA_NUMERO}`))[0]
const devs = await get(`devolucoes?select=id,valor_total,tipo_credito,reembolsos,status,created_at&venda_id=eq.${venda.id}`)
const dev = devs.find((d) => Math.abs(Number(d.valor_total) - Number(conta.valor)) < 0.011)
if (!dev) { console.error('a venda #' + VENDA_NUMERO + ' não tem devolução com esse valor'); process.exit(1) }

console.log(`\nANTES`)
console.log(`  conta     : ${brl(conta.valor)} · ${conta.status} · forma='${conta.forma_pagamento}' · conta=${conta.conta_id ? 'PagBank' : 'NENHUMA'} · devolucao_id=${conta.devolucao_id ?? 'NENHUMA'}`)
console.log(`  venda     : #${venda.numero} · ${brl(venda.total)}`)
console.log(`  devolução : ${dev.id.slice(0, 8)} · ${brl(dev.valor_total)} · ${dev.tipo_credito} · reembolsos=${JSON.stringify(dev.reembolsos)}`)

if (!aplicar && !desfazer) {
  console.log(`\n(ensaio: nada gravado. --aplicar conserta · --desfazer volta)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `conserto-victor-afonso-100-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  conta_id: conta.id, conta_antes: { devolucao_id: conta.devolucao_id },
  devolucao_id: dev.id, devolucao_antes: { tipo_credito: dev.tipo_credito, reembolsos: dev.reembolsos },
}, null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

const corpoConta = desfazer
  ? { devolucao_id: null }
  : { devolucao_id: dev.id, forma_pagamento: 'pix', ...(conta.conta_id ? {} : { conta_id: PAGBANK }), updated_at: new Date().toISOString() }
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
