// DESFAZ o fechamento do caso CARLOS/EMILY, lendo o backup original.
//
//   node --env-file=.env.local scripts/desfazer-carlos-emily.mjs
//
// Por que um script próprio: o `--desfazer` dentro de `fechar-carlos-emily.mjs` lia o
// tipo ATUAL da devolução (já convertido para `pix`) e regravava `pix` — não desfazia
// nada. Aqui os valores vêm do arquivo de backup, que guarda o estado de antes.
//
// O que restaura:
//   devolução f36ddd34 → cancelamento_fiado, reembolsos []
//   devolução 2209d14d → sem_reembolso, reembolsos [{sem_reembolso, 67}]
//   conta 31fec127     → devolucao_id null
//   comprovante        → tira `devolucoes_ligadas`
import fs from 'node:fs'
import path from 'node:path'

const arquivoBackup = fs.readdirSync(path.join('docs', 'registros-banco', '2026-11'))
  .filter((f) => f.startsWith('fechar-carlos-emily-') && f.endsWith('.json'))
  .sort()
  .pop()
if (!arquivoBackup) { console.error('não achei o backup do fechamento'); process.exit(1) }
const backup = JSON.parse(fs.readFileSync(path.join('docs', 'registros-banco', '2026-11', arquivoBackup), 'utf8'))
console.log(`backup usado: ${arquivoBackup}`)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }

for (const d of backup.devolucoes) {
  const r = await fetch(`${url}/rest/v1/devolucoes?id=eq.${d.id}`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ tipo_credito: d.antes.tipo_credito, reembolsos: d.antes.reembolsos }),
  })
  const depois = (await get(`devolucoes?select=valor_total,tipo_credito,reembolsos&id=eq.${d.id}`))[0]
  console.log(`  devolução ${d.id.slice(0, 8)} → ${r.ok ? 'ok' : 'FALHOU'} · ${depois.tipo_credito} · ${JSON.stringify(depois.reembolsos)}`)
}

const rc = await fetch(`${url}/rest/v1/lancamentos?id=eq.${backup.conta.id}`, {
  method: 'PATCH', headers: h, body: JSON.stringify({ devolucao_id: null, updated_at: new Date().toISOString() }),
})
const conta = (await get(`lancamentos?select=descricao,valor,devolucao_id&id=eq.${backup.conta.id}`))[0]
console.log(`  conta ${backup.conta.id.slice(0, 8)} → ${rc.ok ? 'ok' : 'FALHOU'} · devolucao_id=${conta?.devolucao_id ?? 'null'} · ${conta?.descricao}`)

if (backup.prova?.id) {
  const prova = (await get(`pix_saidas?select=id,extraido_raw&id=eq.${backup.prova.id}`))[0]
  const extra = { ...(prova?.extraido_raw ?? {}) }
  delete extra.devolucoes_ligadas
  const rp = await fetch(`${url}/rest/v1/pix_saidas?id=eq.${backup.prova.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ extraido_raw: extra }) })
  console.log(`  comprovante ${backup.prova.transacao_id} → ${rp.ok ? 'ok' : 'FALHOU'} (devolucoes_ligadas removido)`)
}
