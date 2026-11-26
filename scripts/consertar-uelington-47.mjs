// CONSERTO — devolução do UELINGTON BARRETO MARTINS, R$ 47,00 (venda #14538).
//
//   node --env-file=.env.local scripts/consertar-uelington-47.mjs            (ensaio)
//   node --env-file=.env.local scripts/consertar-uelington-47.mjs --aplicar  (grava)
//   node --env-file=.env.local scripts/consertar-uelington-47.mjs --desfazer (volta)
//
// O caso: no dia 21/11 existem DUAS vendas iguais para ele (R$ 47, mesmo item,
// BATERIA MOTOROLA JK50), as duas fiado, e duas devoluções de R$ 47:
//   #14538 → devolução cd922200 · sem_reembolso
//   #14666 → devolução 05d98a57 · cancelamento_fiado (dívida abatida)
// Existe UM PIX de R$ 47 no PagBank (comprovante, recebedor UELINGTON BARRETO
// MARTINS) e a conta a pagar está paga em PIX sem vínculo com devolução.
//
// A escolha (confirmada pelo dono): a conta de R$ 47 é o reembolso da venda #14538
// — a única cuja devolução diz "sem reembolso" enquanto o PIX existe. A #14666
// segue correta como dívida abatida, sem dinheiro.
import fs from 'node:fs'
import path from 'node:path'

const VENDA_NUMERO = 14538
const PAGBANK = '24bff81f-9728-4e10-9b1b-9aad26a2952d'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const desfazer = process.argv.includes('--desfazer')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const conta = (await get(`lancamentos?select=id,valor,descricao,forma_pagamento,conta_id,data_pagamento,devolucao_id,status&descricao=ilike.*UELINGTON*&tipo=eq.pagar&valor=eq.47`))[0]
if (!conta) { console.error('não achei a conta de R$ 47 do Uelington'); process.exit(1) }
const venda = (await get(`vendas?select=id,numero,total&numero=eq.${VENDA_NUMERO}`))[0]
const dev = (await get(`devolucoes?select=id,valor_total,tipo_credito,reembolsos,status&venda_id=eq.${venda.id}`))[0]
if (!dev) { console.error('a venda #' + VENDA_NUMERO + ' não tem devolução'); process.exit(1) }

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
const arquivo = path.join(dir, `conserto-uelington-47-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  conta_id: conta.id, conta_antes: { devolucao_id: conta.devolucao_id, forma_pagamento: conta.forma_pagamento, conta_id: conta.conta_id },
  devolucao_id: dev.id, devolucao_antes: { tipo_credito: dev.tipo_credito, reembolsos: dev.reembolsos },
  obs: 'venda #14666 (mesmo dia, mesmo valor) segue como cancelamento_fiado',
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
