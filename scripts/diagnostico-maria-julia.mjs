// SÓ LEITURA — tudo que envolve a estagiária Maria Julia de Souza Ferreira Carvalho.
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

const { data: pessoas } = await s.from('pessoas').select('id, nome, tipo, ativo, nome_fantasia').ilike('nome', '%maria julia%')
console.log('\n=== pessoa ===')
for (const p of pessoas ?? []) console.log(`  ${p.id} · ${p.nome} · tipo=${p.tipo} · ativo=${p.ativo}`)
const ids = (pessoas ?? []).map((p) => p.id)
const nomes = (pessoas ?? []).map((p) => p.nome)

console.log('\n=== devoluções (por nome) ===')
const dev = await tudo((f, t) => s.from('devolucoes')
  .select('id, venda_id, pessoa_nome, vendedor_nome, motivo, valor_total, tipo_credito, status, abate_fiado, reembolsos, created_at')
  .ilike('pessoa_nome', '%maria julia%').order('created_at').range(f, t))
for (const d of dev) console.log('  ' + JSON.stringify(d))

console.log('\n=== lançamentos com pessoa_id dela ===')
const lc = await tudo((f, t) => s.from('lancamentos')
  .select('id, tipo, descricao, valor, valor_pago, status, categoria, subcategoria, data_vencimento, data_pagamento, forma_pagamento, loja_id, devolucao_id, venda_id')
  .in('pessoa_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  .order('data_vencimento').range(f, t))
for (const l of lc) console.log(`  ${l.tipo.padEnd(7)} venc ${dia(l.data_vencimento)} ${l.status.padEnd(9)} R$ ${brl(l.valor).padStart(9)} ${String(l.categoria ?? '—').padEnd(16)} ${String(l.descricao ?? '').slice(0, 70)}${l.devolucao_id ? ' [dev]' : ''}${l.venda_id ? ' [venda]' : ''}`)

console.log('\n=== lançamentos que citam o nome no texto ===')
const lc2 = await tudo((f, t) => s.from('lancamentos')
  .select('id, tipo, descricao, valor, status, categoria, data_vencimento, pessoa_id, pessoa_nome')
  .ilike('descricao', '%maria julia%').order('data_vencimento').range(f, t))
for (const l of lc2) console.log(`  ${l.tipo.padEnd(7)} venc ${dia(l.data_vencimento)} ${l.status.padEnd(9)} R$ ${brl(l.valor).padStart(9)} ${String(l.categoria ?? '—').padEnd(16)} pessoa=${(l.pessoa_id ?? 'NULL').slice(0, 8)} ${String(l.descricao ?? '').slice(0, 60)}`)

console.log('\n=== créditos do cliente ===')
const cr = await tudo((f, t) => s.from('creditos_clientes')
  .select('id, pessoa_nome, valor, tipo, descricao, devolucao_id, created_at').ilike('pessoa_nome', '%maria julia%').order('created_at').range(f, t))
for (const c of cr) console.log('  ' + JSON.stringify(c))

console.log('\n=== estorno (devolução x reembolso) ===')
for (const d of dev) {
  const devs = Array.isArray(d.reembolsos) ? d.reembolsos : []
  console.log(`  dev ${d.id.slice(0, 8)} · venda ${d.venda_id} · total ${brl(d.valor_total)} · tipo ${d.tipo_credito} · abate_fiado ${brl(d.abate_fiado)} · status ${d.status}`)
  console.log(`    reembolsos: ${devs.length ? JSON.stringify(devs) : '[]'}`)
  const pagos = await tudo((f, t) => s.from('lancamentos')
    .select('id, descricao, valor, status, data_pagamento, forma_pagamento, devolucao_id')
    .eq('devolucao_id', d.id).order('data_vencimento').range(f, t))
  console.log(`    lançamento preso à devolução: ${pagos.length}`)
  for (const p of pagos) console.log(`      ${p.status} R$ ${brl(p.valor)} ${dia(p.data_pagamento)} ${p.forma_pagamento} — ${p.descricao}`)
}
console.log('')
