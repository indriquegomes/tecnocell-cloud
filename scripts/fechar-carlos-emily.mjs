// FECHA O CASO CARLOS HENRIQUE MARQUES FIUZA PITTZER (família / Emily).
//
//   node --env-file=.env.local scripts/fechar-carlos-emily.mjs            (ensaio)
//   node --env-file=.env.local scripts/fechar-carlos-emily.mjs --aplicar  (grava)
//   node --env-file=.env.local scripts/fechar-carlos-emily.mjs --desfazer (volta)
//
// O que o extrato do PagBank mostra: só DOIS PIX para a família em novembro, em
// 10/11 — R$ 128,00 e R$ 112,00, ambos para Emily De Menezes Pittzer Fiuza. Não
// existe PIX de 61 nem de 67.
//
// Decisão do dono (26/11/2026): a venda das duas notas deu R$ 134,00 (67 + 67), ele
// pediu o estorno e foi pago R$ 128,00 — a diferença de R$ 6,00 fica ignorada.
// Fechar = dizer a verdade nas duas devoluções e ligar o PIX de 128 a elas.
//
// Mudanças:
//   devolução f36ddd34 (67, cancelamento_fiado) → pix, reembolso [{pix, 67}]
//   devolução 2209d14d (67, sem_reembolso)      → pix, reembolso [{pix, 67}]
//   conta do PIX de 128: devolucao_id = f36ddd34 (o campo aceita uma; a outra fica
//     registrada no metadado do comprovante)
//   comprovante de 128: extraido_raw.devolucoes_ligadas = [f36ddd34, 2209d14d]
//
// Não mexe em valor, forma, conta nem status de nada.
import fs from 'node:fs'
import path from 'node:path'

const DEV_A = 'f36ddd34' // 67,00 — venda #12198 (fiado)
const DEV_B = '2209d14d' // 67,00 — venda #12533 (dinheiro)
const CONTA_128 = '31fec127' // conta a pagar de R$ 128,00 paga em PIX

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const desfazer = process.argv.includes('--desfazer')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

// uuid não aceita `like` no PostgREST: busca pelas vendas e filtra o prefixo aqui
const acharDev = async (numeroVenda) => {
  const v = (await get(`vendas?select=id&numero=eq.${numeroVenda}`))[0]
  const ds = await get(`devolucoes?select=id,valor_total,tipo_credito,reembolsos&venda_id=eq.${v.id}`)
  return ds[0]
}
const devA = await acharDev(12198)
const devB = await acharDev(12533)
const contas = await get(`lancamentos?select=id,valor,descricao,forma_pagamento,conta_id,devolucao_id&tipo=eq.pagar&descricao=ilike.*Emily*`)
const conta = contas.find((c) => c.id.startsWith(CONTA_128))
const prova = (await get(`pix_saidas?select=id,valor,dia,destinatario,transacao_id,extraido_raw&lancamento_id=eq.${conta?.id ?? 'x'}`))[0]
if (!devA || !devB || !conta) { console.error('não achei alguma das peças (devA/devB/conta)'); process.exit(1) }

console.log(`\nANTES`)
for (const d of [devA, devB]) console.log(`  devolução ${d.id.slice(0, 8)} · ${brl(d.valor_total)} · ${d.tipo_credito} · reembolsos=${JSON.stringify(d.reembolsos)}`)
console.log(`  conta PIX : ${conta.id.slice(0, 8)} · ${brl(conta.valor)} · ${conta.forma_pagamento} · devolucao_id=${conta.devolucao_id ?? 'NENHUMA'}`)
console.log(`  prova     : ${prova ? brl(prova.valor) + ' · ' + prova.dia + ' · ' + prova.transacao_id : 'não achei'}`)
console.log(`  soma das devoluções: ${brl(Number(devA.valor_total) + Number(devB.valor_total))} · PIX pago: ${brl(conta.valor)} · diferença ignorada pelo dono`)

if (!aplicar && !desfazer) {
  console.log(`\n(ensaio: nada gravado. --aplicar fecha · --desfazer volta)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `fechar-carlos-emily-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  devolucoes: [devA, devB].map((d) => ({ id: d.id, antes: { tipo_credito: d.tipo_credito, reembolsos: d.reembolsos } })),
  conta: { id: conta.id, antes: { devolucao_id: conta.devolucao_id } },
  prova: prova ? { id: prova.id, transacao_id: prova.transacao_id } : null,
  obs: 'venda das duas notas = 134,00 (67+67); estorno pago = 128,00; diferenca de 6,00 ignorada por decisao do dono',
}, null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

const corpoDev = (d) => desfazer
  ? { tipo_credito: d.tipo_credito, reembolsos: d.reembolsos }
  : { tipo_credito: 'pix', reembolsos: [{ tipo: 'pix', valor: Number(d.valor_total) }] }

let ok = 0
for (const d of [devA, devB]) {
  const r = await fetch(`${url}/rest/v1/devolucoes?id=eq.${d.id}`, { method: 'PATCH', headers: h, body: JSON.stringify(corpoDev(d)) })
  if (r.ok) ok++
}
console.log(`devoluções ${desfazer ? 'desfeitas' : 'fechadas'}: ${ok} de 2`)

// conta → devolução (uma) e comprovante → as duas
const r2 = await fetch(`${url}/rest/v1/lancamentos?id=eq.${conta.id}`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({ devolucao_id: desfazer ? null : devA.id, updated_at: new Date().toISOString() }),
})
console.log(`conta ↔ devolução: ${r2.ok ? 'ok' : 'falhou'}`)

if (prova) {
  const extra = { ...(prova.extraido_raw ?? {}) }
  if (desfazer) delete extra.devolucoes_ligadas
  else extra.devolucoes_ligadas = [devA.id, devB.id]
  const r3 = await fetch(`${url}/rest/v1/pix_saidas?id=eq.${prova.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ extraido_raw: extra }) })
  console.log(`comprovante ↔ as duas devoluções: ${r3.ok ? 'ok' : 'falhou'}`)
}

for (const d of [devA, devB]) {
  const x = (await get(`devolucoes?select=valor_total,tipo_credito,reembolsos&id=eq.${d.id}`))[0]
  console.log(`  depois ${d.id.slice(0, 8)} · ${brl(x.valor_total)} · ${x.tipo_credito} · ${JSON.stringify(x.reembolsos)}`)
}
