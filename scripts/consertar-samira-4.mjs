// CONSERTO — devolução da SAMIRA AMORIM DOS REIS, R$ 4,00 (venda #11072).
//
//   node --env-file=.env.local scripts/consertar-igor-349.mjs            (ensaio)
//   node --env-file=.env.local scripts/consertar-igor-349.mjs --aplicar  (grava)
//   node --env-file=.env.local scripts/consertar-igor-349.mjs --desfazer (volta)
//
// Devolução PARCIAL: comprou R$ 80,00 (venda #11072) e devolveu uma película de
// R$ 4,00, que voltou ao estoque. O crédito de R$ 4,00 nasceu e foi estornado no
// mesmo dia — o dinheiro foi pago por PIX do PagBank (comprovante no grupo). Falta
// o vínculo com a devolução e a devolução ainda diz `credito_conta`.
import fs from 'node:fs'
import path from 'node:path'

const CONTA_PREFIXO = 'ea0f34ef'
const DEVOLUCAO_PREFIXO = 'f26258dc'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const desfazer = process.argv.includes('--desfazer')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

// a busca por prefixo usa a lista real da tabela (uuid não aceita `like`)
const contas = await get(`lancamentos?select=id,valor,descricao,status,forma_pagamento,conta_id,data_pagamento,devolucao_id&tipo=eq.pagar&descricao=ilike.*SAMIRA*`)
const conta = contas.find((c) => c.id.startsWith(CONTA_PREFIXO))
const devs = await get(`devolucoes?select=id,valor_total,tipo_credito,reembolsos,status&pessoa_nome=ilike.*SAMIRA*`)
const dev = devs.find((d) => d.id.startsWith(DEVOLUCAO_PREFIXO))
if (!conta || !dev) { console.error('não achei a conta ou a devolução'); process.exit(1) }

console.log(`\nANTES`)
console.log(`  conta     : ${brl(conta.valor)} · ${conta.status} · forma='${conta.forma_pagamento}' · conta=${conta.conta_id ? 'PagBank' : 'NENHUMA'} · devolucao_id=${conta.devolucao_id ?? 'NENHUMA'}`)
console.log(`  devolução : ${dev.id.slice(0, 8)} · ${brl(dev.valor_total)} · ${dev.tipo_credito} · reembolsos=${JSON.stringify(dev.reembolsos)}`)

if (!aplicar && !desfazer) {
  console.log(`\n(ensaio: nada gravado. --aplicar conserta · --desfazer volta)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `conserto-samira-4-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  conta_id: conta.id, conta_antes: { devolucao_id: conta.devolucao_id },
  devolucao_id: dev.id, devolucao_antes: { tipo_credito: dev.tipo_credito, reembolsos: dev.reembolsos },
}, null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

const corpoConta = desfazer ? { devolucao_id: null } : { devolucao_id: dev.id, updated_at: new Date().toISOString() }
const corpoDev = desfazer
  ? { tipo_credito: 'credito_conta', reembolsos: [{ tipo: 'credito_conta', valor: Number(dev.valor_total) }] }
  : { tipo_credito: 'pix', reembolsos: [{ tipo: 'pix', valor: Number(dev.valor_total) }] }

const r1 = await fetch(`${url}/rest/v1/lancamentos?id=eq.${conta.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoConta) })
const r2 = await fetch(`${url}/rest/v1/devolucoes?id=eq.${dev.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoDev) })

const dc = (await get(`lancamentos?select=valor,status,forma_pagamento,conta_id,devolucao_id&id=eq.${conta.id}`))[0]
const dd = (await get(`devolucoes?select=valor_total,tipo_credito,reembolsos&id=eq.${dev.id}`))[0]
console.log(`\nDEPOIS (${desfazer ? 'desfeito' : 'consertado'}) — conta ok=${r1.ok} · devolução ok=${r2.ok}`)
console.log(`  conta     : ${brl(dc.valor)} · ${dc.status} · forma='${dc.forma_pagamento}' · conta=${dc.conta_id ? 'PagBank' : 'NENHUMA'} · devolucao_id=${dc.devolucao_id ?? 'NENHUMA'}`)
console.log(`  devolução : ${brl(dd.valor_total)} · ${dd.tipo_credito} · reembolsos=${JSON.stringify(dd.reembolsos)}`)
