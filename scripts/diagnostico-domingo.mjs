// SÓ LEITURA — o que existe no domingo 22/11/2026 (loja não abre): venda, caixa,
// movimento de gaveta, devolução e lançamento. Mostra a data em UTC e a data de
// São Paulo, porque linha de sábado à noite cai no domingo em UTC.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sp = (x) => (x ? new Date(x).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
// DIA de um campo de data: `data_pagamento` gravado como data pura vira meia-noite UTC,
// que em São Paulo é 21h do dia anterior — converter direto para o fuso joga pagamento de
// segunda no domingo. Quem é data pura fica sendo o próprio dia (mesma regra do formatDate).
const ehDataPura = (x) => typeof x === 'string' && x.includes('T00:00:00+00')
const diaSP = (x) => {
  if (!x) return '—'
  if (ehDataPura(x)) return x.slice(0, 10)
  return new Date(x).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
async function fetchAll(q) { const o = []; for (let i = 0; i < 200000; i += 1000) { const { data, error } = await q(i, i + 999); if (error) throw new Error(error.message); if (!data || !data.length) break; o.push(...data); if (data.length < 1000) break } return o }

const DOMINGO = '2026-11-22'
// janela UTC larga (sábado 12h → segunda 06h local) para pegar tudo e classificar por dia de SP
const deUTC = '2026-11-21T12:00:00-03:00'
const ateUTC = '2026-11-24T03:00:00-03:00'

const vendas = await fetchAll((f, t) => s.from('vendas').select('id, numero, total, created_at, status, uso_interno, caixa_id').gte('created_at', deUTC).lt('created_at', ateUTC).order('created_at').range(f, t))
const porDia = new Map()
for (const v of vendas) { const k = diaSP(v.created_at); porDia.set(k, [...(porDia.get(k) ?? []), v]) }
console.log('\n=== VENDAS por dia de SÃO PAULO (21 a 24/11) ===')
for (const [k, vs] of [...porDia].sort()) console.log(`  ${k}: ${vs.length} venda(s) · R$ ${brl(vs.reduce((t, v) => t + Number(v.total || 0), 0))}${k === DOMINGO ? '   ← DOMINGO' : ''}`)
const domingo = porDia.get(DOMINGO) ?? []
if (domingo.length) {
  console.log(`\n  vendas no DOMINGO (${domingo.length}):`)
  for (const v of domingo.slice(0, 20)) console.log(`    #${v.numero} ${sp(v.created_at)} (UTC ${v.created_at.slice(0, 19)}) R$ ${brl(v.total)} ${v.status}${v.uso_interno ? ' USO INTERNO' : ''}`)
}

const caixas = await fetchAll((f, t) => s.from('caixas').select('id, loja_id, status, valor_abertura, valor_fechamento, aberto_em, fechado_em').gte('aberto_em', deUTC).lt('aberto_em', ateUTC).order('aberto_em').range(f, t))
console.log('\n=== CAIXAS por dia de abertura (SP) ===')
for (const c of caixas) console.log(`  ${diaSP(c.aberto_em)} ${sp(c.aberto_em)} · ${c.status} · abertura ${brl(c.valor_abertura)} · fech ${brl(c.valor_fechamento)}${diaSP(c.aberto_em) === DOMINGO ? '   ← DOMINGO' : ''}`)

const movs = await fetchAll((f, t) => s.from('movimentos_caixa').select('id, caixa_id, tipo, valor, forma_pagamento, motivo, created_at').gte('created_at', deUTC).lt('created_at', ateUTC).order('created_at').range(f, t))
const movDia = new Map()
for (const m of movs) movDia.set(diaSP(m.created_at), (movDia.get(diaSP(m.created_at)) ?? 0) + 1)
console.log('\n=== MOVIMENTOS DE CAIXA por dia de SP ===')
for (const [k, n] of [...movDia].sort()) console.log(`  ${k}: ${n} movimento(s)${k === DOMINGO ? '   ← DOMINGO' : ''}`)

const devs = await fetchAll((f, t) => s.from('devolucoes').select('id, valor_total, tipo_credito, created_at, pessoa_nome').gte('created_at', deUTC).lt('created_at', ateUTC).order('created_at').range(f, t))
const devDia = new Map()
for (const d of devs) devDia.set(diaSP(d.created_at), (devDia.get(diaSP(d.created_at)) ?? 0) + 1)
console.log('\n=== DEVOLUÇÕES por dia de SP ===')
for (const [k, n] of [...devDia].sort()) console.log(`  ${k}: ${n} devolução(ões)${k === DOMINGO ? '   ← DOMINGO' : ''}`)

// lançamentos: o que foi PAGO no domingo (data_pagamento) e o que tem vencimento domingo
const pagos = await fetchAll((f, t) => s.from('lancamentos').select('id, tipo, descricao, valor, valor_pago, categoria, forma_pagamento, data_pagamento').gte('data_pagamento', deUTC).lt('data_pagamento', ateUTC).order('data_pagamento').range(f, t))
console.log('\n=== LANÇAMENTOS com pagamento no domingo (SP) ===')
const pagosDom = pagos.filter((p) => diaSP(p.data_pagamento) === DOMINGO)
if (!pagosDom.length) console.log('  nenhum')
for (const p of pagosDom) console.log(`  ${sp(p.data_pagamento)} ${p.tipo} R$ ${brl(p.valor_pago || p.valor)} ${p.categoria} ${p.forma_pagamento ?? '-'} · ${String(p.descricao).slice(0, 46)}`)
