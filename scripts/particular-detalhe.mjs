// SÓ LEITURA — detalhe das linhas que vão virar conta particular + rastro dos itens 4,5,6,7.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const P = 1000
async function tudo(q) { const o = []; for (let i = 0; i < 400000; i += P) { const { data, error } = await q(i, i + P - 1); if (error) throw new Error(error.message); if (!data?.length) break; o.push(...data); if (data.length < P) break } return o }
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (x) => (x ?? '').slice(0, 10)

console.log('\n=== 1. Retirada do sócio (nov/2026) — inteiro ===')
const ret = await tudo((from, to) => s.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, categoria, subcategoria, data_vencimento, data_pagamento, forma_pagamento, loja_id, pessoa_nome, conta_id, comprovante_url, historico_pagamentos')
  .eq('tipo', 'pagar').eq('categoria', 'Retirada do sócio')
  .gte('data_vencimento', '2026-11-01').lt('data_vencimento', '2026-12-01')
  .order('data_vencimento').range(from, to))
for (const l of ret) {
  console.log(`  id=${l.id}`)
  console.log(`    ${dia(l.data_vencimento)}  R$ ${brl(l.valor)} (pago ${brl(l.valor_pago)})  ${l.status}  ${l.forma_pagamento}  loja=${(l.loja_id ?? '').slice(0, 8)}`)
  console.log(`    desc: ${l.descricao}`)
  console.log(`    pessoa: ${l.pessoa_nome}  conta: ${l.conta_id ?? '—'}  comprovante: ${l.comprovante_url ? 'sim' : 'não'}`)
  console.log(`    hist: ${JSON.stringify(l.historico_pagamentos)}`)
}

console.log('\n=== 2. Pró-labore: 2026-10 → 2027-01 ===')
const pl = await tudo((from, to) => s.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, categoria, data_vencimento, data_pagamento, forma_pagamento, loja_id')
  .eq('tipo', 'pagar').eq('categoria', 'Pró-labore')
  .gte('data_vencimento', '2026-10-01').lt('data_vencimento', '2027-02-01')
  .order('data_vencimento').range(from, to))
for (const l of pl) console.log(`  ${dia(l.data_vencimento)}  R$ ${brl(l.valor).padStart(10)}  ${String(l.status).padEnd(10)} pago:${dia(l.data_pagamento)}  ${l.descricao}  [${(l.loja_id ?? '').slice(0, 8)}]`)

console.log('\n=== 3. Item 4 — "original" em lançamentos e movimentos ===')
const lo = await tudo((from, to) => s.from('lancamentos')
  .select('id, tipo, descricao, valor, status, categoria, data_vencimento, data_pagamento')
  .ilike('descricao', '%original%').order('data_vencimento').range(from, to))
console.log(`  lançamentos: ${lo.length}`)
for (const l of lo.slice(0, 20)) console.log(`    ${l.tipo} venc ${dia(l.data_vencimento)} pago ${dia(l.data_pagamento)} R$ ${brl(l.valor)} ${l.status} ${l.categoria} — ${l.descricao}`)
const mo = await tudo((from, to) => s.from('movimentos_caixa')
  .select('id, tipo, valor, motivo, forma_pagamento, created_at').ilike('motivo', '%original%')
  .order('created_at').range(from, to))
console.log(`  movimentos_caixa (motivo): ${mo.length}`)
for (const m of mo.slice(0, 20)) console.log(`    ${dia(m.created_at)} ${m.tipo} R$ ${brl(m.valor)} ${m.forma_pagamento} — ${m.motivo}`)

console.log('\n=== 4. Item 5 — DPVAT / licenciamento / HPG ===')
for (const termo of ['DPVAT', 'LICENCIAMENTO', 'HPG']) {
  const ls = await tudo((from, to) => s.from('lancamentos')
    .select('id, tipo, descricao, valor, status, categoria, data_vencimento, data_pagamento')
    .ilike('descricao', `%${termo}%`).order('data_vencimento').range(from, to))
  console.log(`  "${termo}": ${ls.length}`)
  for (const l of ls.slice(0, 20)) console.log(`    ${l.tipo} venc ${dia(l.data_vencimento)} pago ${dia(l.data_pagamento)} R$ ${brl(l.valor)} ${l.status} ${l.categoria} — ${String(l.descricao ?? '').slice(0, 90)}`)
}

console.log('\n=== 5. Item 6 — acordo 135/2026 ===')
for (const termo of ['135/2026', 'ACORDO']) {
  const ls = await tudo((from, to) => s.from('lancamentos')
    .select('id, tipo, descricao, valor, status, categoria, data_vencimento, data_pagamento')
    .ilike('descricao', `%${termo}%`).order('data_vencimento').range(from, to))
  console.log(`  "${termo}": ${ls.length}`)
  for (const l of ls.slice(0, 20)) console.log(`    ${l.tipo} venc ${dia(l.data_vencimento)} pago ${dia(l.data_pagamento)} R$ ${brl(l.valor)} ${l.status} ${l.categoria} — ${String(l.descricao ?? '').slice(0, 90)}`)
}

console.log('\n=== 6. Item 7 — nota fiscal de troca ===')
for (const termo of ['NOTA FISCAL', 'DEVOLUCAO AO FORNECEDOR', 'TROCA']) {
  const ls = await tudo((from, to) => s.from('lancamentos')
    .select('id, tipo, descricao, valor, status, categoria, data_vencimento')
    .ilike('descricao', `%${termo}%`)
    .gte('data_vencimento', '2026-10-15').lt('data_vencimento', '2026-12-31')
    .order('data_vencimento').range(from, to))
  console.log(`  "${termo}" (15/10→31/12): ${ls.length}`)
  for (const l of ls.slice(0, 12)) console.log(`    ${l.tipo} ${dia(l.data_vencimento)} R$ ${brl(l.valor)} ${l.status} ${l.categoria} — ${String(l.descricao ?? '').slice(0, 90)}`)
}
console.log('')
