// CONSERTO — estorno de crédito de R$ 51,00 (Marcos Vinicius Ferreira da Conceição,
// venda #15287, Teresópolis) pago como "Fora do app (WhatsApp)".
//
// O que estava errado: o PIX de R$ 51,00 SAIU do PagBank de verdade (comprovante
// PagBank de 24/11/2026 18:54, ID E2E E08561701202611242154SDWN4SYVFDY), mas a conta
// a pagar foi quitada com forma "Fora do app" e sem conta — forma que de propósito
// não baixa banco. Resultado: o saldo do PagBank ficava R$ 51,00 acima do extrato.
//
// O que este script faz (só nesta linha):
//   forma  → pix
//   conta  → PagBank Petrópolis (a conta bancária única do app — docs/mapa/contas-e-pix.md)
//   data   → 24/11/2026 18:54 (instante real do PIX, em São Paulo)
//   histórico → uma linha com o ID E2E, para a prova ficar na própria conta
//
// Uso:
//   node --env-file=.env.local scripts/consertar-estorno-51-marcos.mjs            (conserta)
//   node --env-file=.env.local scripts/consertar-estorno-51-marcos.mjs --desfazer (volta)
//
// Grava backup JSON em docs/registros-banco/2026-11/ antes de tocar em qualquer coisa.
import fs from 'node:fs'
import path from 'node:path'

const ID = '5bb8e6d0-1ad3-499b-ba3a-092cbaf0d6ec'
const CONTA_PAGBANK = '24bff81f-9728-4e10-9b1b-9aad26a2952d' // PagBank Petrópolis (conta única)
const E2E = 'E08561701202611242154SDWN4SYVFDY'
// 24/11/2026 18:54:34 em São Paulo = 21:54:34 UTC
const DATA_PIX = '2026-11-24T18:54:34-03:00'
const FORMA_ANTIGA = 'Fora do app (WhatsApp)'
const DATA_ANTIGA = '2026-11-25T19:43:14.985+00:00'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const desfazer = process.argv.includes('--desfazer')

async function pega() {
  const r = await fetch(`${url}/rest/v1/lancamentos?id=eq.${ID}&select=*`, { headers: h })
  const j = await r.json()
  return j[0]
}

const antes = await pega()
if (!antes) { console.error('lançamento não encontrado'); process.exit(1) }

console.log(`\nANTES: ${antes.descricao}`)
console.log(`  R$ ${antes.valor} · ${antes.status} · forma="${antes.forma_pagamento}" · conta=${antes.conta_id ?? '(nenhuma)'} · pagamento=${antes.data_pagamento}`)

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `backup-estorno-51-marcos-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify({ id: ID, antes, desfazer: true, em: new Date().toISOString() }, null, 2), 'utf8')
console.log(`  backup: ${arquivo}`)

const depois = desfazer
  ? { forma_pagamento: FORMA_ANTIGA, conta_id: null, data_pagamento: DATA_ANTIGA, historico_pagamentos: [] }
  : {
      forma_pagamento: 'pix',
      conta_id: CONTA_PAGBANK,
      data_pagamento: DATA_PIX,
      historico_pagamentos: [{
        valor: 51,
        forma: 'pix',
        data: DATA_PIX,
        lancamento_id: ID,
        comprovante_pix: E2E,
        obs: 'PIX enviado ao cliente — devolução da venda #15287 (comprovante no grupo de estornos)',
      }],
    }

const r = await fetch(`${url}/rest/v1/lancamentos?id=eq.${ID}`, {
  method: 'PATCH',
  headers: h,
  body: JSON.stringify({ ...depois, updated_at: new Date().toISOString() }),
})
const feito = (await r.json())[0]
console.log(`\nDEPOIS (${desfazer ? 'DESFEITO' : 'consertado'}):`)
console.log(`  forma="${feito.forma_pagamento}" · conta=${feito.conta_id ?? '(nenhuma)'} · pagamento=${feito.data_pagamento} · valor_pago=${feito.valor_pago}`)
console.log(`  histórico: ${JSON.stringify(feito.historico_pagamentos)}`)
