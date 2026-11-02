// Números oficiais de outubro/2026 — READ-ONLY, com contagem exata e paginação verificada.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
async function pagina(tabela, colunas, aplicar, ordem = 'id') {
  const o = []
  for (let p = 0; ; p++) {
    let q = s.from(tabela).select(colunas)
    if (aplicar) q = aplicar(q)
    const { data, error } = await q.order(ordem).range(p * 1000, p * 1000 + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data.length) break
    o.push(...data)
    if (data.length < 1000) break
  }
  return o
}
const de = '2026-10-01T00:00:00-03:00', ate = '2026-11-01T00:00:00-03:00'
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const { data: lojas } = await s.from('lojas').select('id, nome')
const deps = await pagina('depositos', 'id, loja_id')
const cxs = await pagina('caixas', 'id, loja_id')
const formas = (await s.from('formas_pagamento').select('id, nome, tipo')).data ?? []
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))
const lojaCx = new Map(cxs.map((c) => [c.id, c.loja_id]))
const formaDe = new Map(formas.map((f) => [f.id, f]))
const nome = (id) => lojas.find((l) => l.id === id)?.nome ?? '(sem loja)'

const vendas = await pagina('vendas', 'id, total, deposito_id, status, uso_interno', (q) => q.eq('status', 'concluida').eq('uso_interno', false).gte('data', de).lt('data', ate))
const vendaLoja = new Map(vendas.map((v) => [v.id, lojaDep.get(v.deposito_id)]))
const pags = []
for (let i = 0; i < vendas.length; i += 150) {
  const lote = vendas.slice(i, i + 150).map((v) => v.id)
  pags.push(...await pagina('pagamentos_venda', 'venda_id, valor, forma_pagamento_id, status', (q) => q.in('venda_id', lote)))
}
const movs = await pagina('movimentos_caixa', 'tipo, forma_pagamento, valor, caixa_id', (q) => q.gte('created_at', de).lt('created_at', ate), 'created_at')

console.log('=== OFICIAL OUTUBRO/2026 ===')
console.log('vendas concluídas:', vendas.length, '·', brl(vendas.reduce((t, v) => t + Number(v.total ?? 0), 0)))
const porStatus = {}
for (const p of pags) { const k = p.status; porStatus[k] ??= { n: 0, v: 0 }; porStatus[k].n++; porStatus[k].v += Number(p.valor ?? 0) }
console.log('pagamentos de venda:')
for (const [k, v] of Object.entries(porStatus).sort((a, b) => b[1].v - a[1].v)) console.log(`  ${k.padEnd(10)} ${String(v.n).padStart(6)} · ${brl(v.v)}`)

console.log('\nentradas por forma (venda paga + fiado recebido):')
const ent = {}
for (const p of pags.filter((p) => p.status === 'pago')) { const f = formaDe.get(p.forma_pagamento_id); const k = `venda ${f?.nome ?? '?'}`; ent[k] = (ent[k] ?? 0) + Number(p.valor ?? 0) }
for (const m of movs.filter((m) => m.tipo === 'recebimento')) { const k = `fiado ${m.forma_pagamento ?? '?'}`; ent[k] = (ent[k] ?? 0) + Number(m.valor ?? 0) }
const totalEnt = Object.values(ent).reduce((a, b) => a + b, 0)
for (const [k, v] of Object.entries(ent).sort((a, b) => b[1] - a[1])) console.log(`  ${brl(v).padStart(14)} ${k}`)
console.log(`  ${brl(totalEnt).padStart(14)} TOTAL ENTRADO`)

console.log('\ndinheiro por loja (venda em dinheiro + fiado em dinheiro + reforço − retirada − devolução):')
for (const l of lojas) {
  const vd = pags.filter((p) => p.status === 'pago' && vendaLoja.get(p.venda_id) === l.id && formaDe.get(p.forma_pagamento_id)?.tipo === 'dinheiro').reduce((t, p) => t + Number(p.valor ?? 0), 0)
  const mm = movs.filter((m) => lojaCx.get(m.caixa_id) === l.id && (m.forma_pagamento ?? '').toLowerCase().includes('dinheiro'))
  const ent2 = mm.filter((m) => m.tipo === 'recebimento' || m.tipo === 'reforco').reduce((t, m) => t + Number(m.valor ?? 0), 0)
  const sai = mm.filter((m) => m.tipo === 'retirada' || m.tipo === 'devolucao').reduce((t, m) => t + Number(m.valor ?? 0), 0)
  console.log(`  ${l.nome}: venda ${brl(vd)} + receb/reforço ${brl(ent2)} − saídas ${brl(sai)} = ${brl(vd + ent2 - sai)}`)
}
const recebTotal = movs.filter((m) => m.tipo === 'recebimento').reduce((t, m) => t + Number(m.valor ?? 0), 0)
console.log('\nfiado recebido total:', brl(recebTotal), '| movimentos:', movs.filter((m) => m.tipo === 'recebimento').length)
console.log('retiradas:', brl(movs.filter((m) => m.tipo === 'retirada').reduce((t, m) => t + Number(m.valor ?? 0), 0)))
console.log('devoluções em caixa:', brl(movs.filter((m) => m.tipo === 'devolucao').reduce((t, m) => t + Number(m.valor ?? 0), 0)))
console.log('reforços:', brl(movs.filter((m) => m.tipo === 'reforco').reduce((t, m) => t + Number(m.valor ?? 0), 0)))
