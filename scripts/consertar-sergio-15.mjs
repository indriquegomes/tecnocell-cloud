// CONSERTO — devolução do SERGIO CELULARES, R$ 15,00 (venda #15473).
//
//   node --env-file=.env.local scripts/consertar-sergio-15.mjs            (ensaio)
//   node --env-file=.env.local scripts/consertar-sergio-15.mjs --aplicar  (grava)
//   node --env-file=.env.local scripts/consertar-sergio-15.mjs --desfazer (volta)
//
// O caso: o cliente pagou R$ 15,00 (PIX), devolveu a peça e a loja devolveu os
// R$ 15,00 por PIX — o comprovante do PagBank prova (ID E2E
// E08561701202611260033I3F89UIZ1NJ, recebedor "Luciana Lucio Trece", que é a conta
// de quem ele pediu para receber). Mas estava tudo marcado como "fora do app", que
// não baixa de conta nenhuma: o PagBank ficava R$ 15,00 acima do extrato.
//
// O que muda:
//   conta a pagar  : forma fora_do_app → pix · conta → PagBank · data → instante do PIX
//   devolução      : tipo_credito fora_do_app → pix · reembolsos [{pix, 15}]
//   gaveta         : não recebe nada (PIX não passa por dinheiro vivo)
//
// Reversível: backup JSON em docs/registros-banco/2026-11/ antes de tocar.
import fs from 'node:fs'
import path from 'node:path'

const CONTA = '09545566-0187-408e-b19b-4d8df3a71c66'      // conta a pagar "Devolução — SERGIO CELULARES"
const DEVOLUCAO = 'a0775db0-f8c2-4c1a-a761-722424def3fc' // devolução da venda #15473
const PAGBANK = '24bff81f-9728-4e10-9b1b-9aad26a2952d'   // conta bancária única do app
const E2E = 'E08561701202611260033I3F89UIZ1NJ'
// O ID E2E carrega a hora local do PIX: 26/11/2026 00:33 (São Paulo).
const DATA_PIX = '2026-11-26T00:33:00-03:00'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const desfazer = process.argv.includes('--desfazer')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const conta = (await get(`lancamentos?select=*&id=eq.${CONTA}`))[0]
const dev = (await get(`devolucoes?select=*&id=eq.${DEVOLUCAO}`))[0]
if (!conta || !dev) { console.error('não achei a conta ou a devolução'); process.exit(1) }

console.log(`\nANTES`)
console.log(`  conta     : ${brl(conta.valor)} · ${conta.status} · forma='${conta.forma_pagamento}' · conta=${conta.conta_id ?? 'NENHUMA'} · pag=${conta.data_pagamento}`)
console.log(`  devolução : ${brl(dev.valor_total)} · ${dev.tipo_credito} · reembolsos=${JSON.stringify(dev.reembolsos)}`)

if (!aplicar && !desfazer) {
  console.log(`\n(ensaio: nada gravado. --aplicar conserta · --desfazer volta)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `conserto-sergio-15-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  conta_id: CONTA, devolucao_id: DEVOLUCAO,
  antes: {
    conta: { forma_pagamento: conta.forma_pagamento, conta_id: conta.conta_id, data_pagamento: conta.data_pagamento },
    devolucao: { tipo_credito: dev.tipo_credito, reembolsos: dev.reembolsos },
  },
}, null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

const corpoConta = desfazer
  ? { forma_pagamento: 'fora_do_app', conta_id: null, data_pagamento: conta.data_pagamento }
  : { forma_pagamento: 'pix', conta_id: PAGBANK, data_pagamento: DATA_PIX, updated_at: new Date().toISOString() }
const corpoDev = desfazer
  ? { tipo_credito: 'fora_do_app', reembolsos: [{ tipo: 'fora_do_app', valor: 15 }] }
  : { tipo_credito: 'pix', reembolsos: [{ tipo: 'pix', valor: 15 }] }

const r1 = await fetch(`${url}/rest/v1/lancamentos?id=eq.${CONTA}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoConta) })
const r2 = await fetch(`${url}/rest/v1/devolucoes?id=eq.${DEVOLUCAO}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoDev) })

const depoisConta = (await get(`lancamentos?select=valor,status,forma_pagamento,conta_id,data_pagamento,valor_pago&id=eq.${CONTA}`))[0]
const depoisDev = (await get(`devolucoes?select=valor_total,tipo_credito,reembolsos&id=eq.${DEVOLUCAO}`))[0]
console.log(`\nDEPOIS (${desfazer ? 'desfeito' : 'consertado'}) — conta ok=${r1.ok} · devolução ok=${r2.ok}`)
console.log(`  conta     : ${brl(depoisConta.valor)} · ${depoisConta.status} · forma='${depoisConta.forma_pagamento}' · conta=${depoisConta.conta_id ?? 'NENHUMA'} · pag=${depoisConta.data_pagamento}`)
console.log(`  devolução : ${brl(depoisDev.valor_total)} · ${depoisDev.tipo_credito} · reembolsos=${JSON.stringify(depoisDev.reembolsos)}`)
console.log(`  prova     : ${E2E} (comprovante ligado a esta conta)`)
