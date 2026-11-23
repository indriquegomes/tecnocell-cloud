// SÓ LEITURA — contexto para decidir a devolução de R$ 65,00 e as pendências da estagiária.
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

console.log('\n=== valores que tipo_credito assume em devolucoes ===')
const todasDev = await tudo((f, t) => s.from('devolucoes').select('id, tipo_credito, valor_total, created_at').range(f, t))
const porTipo = {}
for (const d of todasDev) porTipo[d.tipo_credito] = (porTipo[d.tipo_credito] ?? 0) + 1
console.log('  ' + JSON.stringify(porTipo))

console.log('\n=== venda da devolução de 65,00 (b83fba12) ===')
const { data: venda } = await s.from('vendas').select('id, numero, total, created_at, status, cliente_nome, vendedor_nome').eq('id', 'b83fba12-8976-48e7-a92f-08aa3e33f82b').maybeSingle()
console.log('  ' + JSON.stringify(venda))
if (venda) {
  const { data: itens } = await s.from('itens_venda').select('produto_nome, quantidade, preco_unitario, subtotal').eq('venda_id', venda.id)
  for (const i of itens ?? []) console.log(`    item: ${i.quantidade} × ${i.produto_nome} = R$ ${brl(i.subtotal)}`)
  const { data: pags } = await s.from('pagamentos_venda').select('forma_pagamento_id, valor, status').eq('venda_id', venda.id)
  for (const p of pags ?? []) console.log(`    pagamento: ${p.status} R$ ${brl(p.valor)}`)
}

console.log('\n=== compras dela em 12/11 (troca?) ===')
const { data: vs } = await s.from('vendas').select('id, numero, total, created_at, cliente_nome, status')
  .ilike('cliente_nome', '%maria julia%').gte('created_at', '2026-11-11').lt('created_at', '2026-11-14').order('created_at')
for (const v of vs ?? []) console.log(`  ${v.created_at.slice(0, 16)} venda #${v.numero} R$ ${brl(v.total)} ${v.status} — ${v.cliente_nome}`)

console.log('\n=== todas as linhas "bolsa estágio" / vale transporte dela ===')
const folha = await tudo((f, t) => s.from('lancamentos')
  .select('id, tipo, descricao, valor, valor_pago, status, categoria, data_vencimento, data_pagamento, forma_pagamento, pessoa_id, loja_id')
  .or('descricao.ilike.%bolsa est%gio%,descricao.ilike.%maria julia%')
  .order('data_vencimento').range(f, t))
for (const l of folha) console.log(`  ${dia(l.data_vencimento)} ${String(l.status).padEnd(9)} R$ ${brl(l.valor).padStart(9)} pago ${dia(l.data_pagamento)} ${String(l.forma_pagamento ?? '—').padEnd(8)} pessoa=${(l.pessoa_id ?? 'NULL').slice(0, 8)} ${String(l.descricao ?? '').slice(0, 80)}`)

console.log('\n=== vale transporte nas últimas folhas (para ver quem tem) ===')
const vt = await tudo((f, t) => s.from('lancamentos')
  .select('id, descricao, valor, status, data_vencimento, pessoa_id')
  .ilike('descricao', '%vale transporte%').gte('data_vencimento', '2026-11-01').order('data_vencimento').range(f, t))
for (const l of vt) console.log(`  ${dia(l.data_vencimento)} ${String(l.status).padEnd(9)} R$ ${brl(l.valor).padStart(8)} pessoa=${(l.pessoa_id ?? 'NULL').slice(0, 8)} ${String(l.descricao ?? '').slice(0, 70)}`)
console.log('')
