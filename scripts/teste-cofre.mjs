// READ-ONLY: simula a tela de Contas com o modelo novo (gaveta = 200 fixo; dinheiro
// de venda e de devolução vive no COFRE) e um dia inteiro de operação.
// O saldo é calculado com a MESMA régua do app (lib/saldos-contas.ts):
//   saldo = saldo_inicial + vendas em dinheiro da loja − devoluções em dinheiro
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function P(t, c, f) { const r = []; for (let p = 0; ; p++) { let q = s.from(t).select(c); if (f) q = f(q); const { data, error } = await q.order('id').range(p * 1000, p * 1000 + 999); if (error) throw new Error(t + ': ' + error.message); if (!data.length) break; r.push(...data); if (data.length < 1000) break } return r }

const { data: contas } = await s.from('contas').select('id, nome, tipo, saldo_inicial, loja_id').eq('ativa', true)
const { data: lojas } = await s.from('lojas').select('id, nome')
const deps = await P('depositos', 'id, loja_id'); const depLoja = new Map(deps.map((d) => [d.id, d.loja_id]))
const cxs = await P('caixas', 'id, loja_id'); const cxLoja = new Map(cxs.map((c) => [c.id, c.loja_id]))
const { data: formas } = await s.from('formas_pagamento').select('id, tipo')
const din = new Set(formas.filter((f) => f.tipo === 'dinheiro').map((f) => f.id))
const vendas = await P('vendas', 'id, deposito_id, data'); const vLoja = new Map(vendas.map((v) => [v.id, depLoja.get(v.deposito_id)])); const vData = new Map(vendas.map((v) => [v.id, v.data]))
const pags = await P('pagamentos_venda', 'valor, forma_pagamento_id, status, venda_id', (q) => q.eq('status', 'pago'))
const vendasDin = {}
for (const p of pags) { if (!din.has(p.forma_pagamento_id) || !p.venda_id) continue; const l = vLoja.get(p.venda_id); if (!l) continue; if ((vData.get(p.venda_id) ?? '') < '2026-11-01') continue; vendasDin[l] = (vendasDin[l] ?? 0) + Number(p.valor ?? 0) }
const movs = await P('movimentos_caixa', 'tipo, forma_pagamento, valor, caixa_id, created_at', (q) => q.eq('tipo', 'devolucao'))
const devDin = {}
for (const m of movs) { if ((m.forma_pagamento ?? '').toLowerCase() !== 'dinheiro') continue; if ((m.created_at ?? '') < '2026-11-01') continue; const l = cxLoja.get(m.caixa_id); if (!l) continue; devDin[l] = (devDin[l] ?? 0) + Number(m.valor ?? 0) }

const saldoReal = (c) => {
  const base = Number(c.saldo_inicial ?? 0)
  if (c.tipo === 'cofre') return base + (vendasDin[c.loja_id] ?? 0) - (devDin[c.loja_id] ?? 0)
  return base
}

console.log('=== TELA DE CONTAS (dinheiro em espécie) — do jeito que o app calcula ===')
for (const l of lojas ?? []) {
  const cx = (contas ?? []).find((c) => c.tipo === 'caixa' && c.loja_id === l.id)
  const cf = (contas ?? []).find((c) => c.tipo === 'cofre' && c.loja_id === l.id)
  const a = cx ? saldoReal(cx) : 0, b = cf ? saldoReal(cf) : 0
  console.log(`\n${l.nome}`)
  console.log(`  💵 ${cx?.nome}: ${brl(a)}   (fundo de troco fixo — nunca sai)`)
  console.log(`  🗄️  ${cf?.nome}: ${brl(b)}`)
  console.log(`  = dinheiro em mãos: ${brl(a + b)}`)
}

const PET = (lojas ?? []).find((l) => l.nome === 'Petrópolis')
const cx = (contas ?? []).find((c) => c.tipo === 'caixa' && c.loja_id === PET.id)
const cf = (contas ?? []).find((c) => c.tipo === 'cofre' && c.loja_id === PET.id)
let gaveta = saldoReal(cx), cofre = saldoReal(cf)
const total0 = gaveta + cofre

console.log('\n=== TESTE 1 — abre 200, vende 10.000 em dinheiro, fecha com 10.200 ===')
cofre += 10000
console.log(`  venda 10.000 em dinheiro → cofre: gaveta ${brl(gaveta)} · cofre ${brl(cofre)}`)
console.log(`  fechamento: operador conta ${brl(gaveta + 10000)}; leva os 10.000, ficam os ${brl(gaveta)} de troco`)
console.log(`  soma em espécie ${brl(gaveta + cofre)} = antes ${brl(total0)} + 10.000`)

console.log('\n=== TESTE 2 — vende 500 em espécie ===')
cofre += 500
console.log(`  gaveta ${brl(gaveta)} · cofre ${brl(cofre)}`)

console.log('\n=== TESTE 3 — paga 5.000 ao fornecedor EM DINHEIRO (do cofre) ===')
cofre -= 5000
console.log(`  gaveta ${brl(gaveta)} (intocada) · cofre ${brl(cofre)}`)

console.log('\n=== TESTE 4 — devolução em espécie do mesmo dia ===')
cofre -= 300
console.log(`  devolve 300 → cofre: gaveta ${brl(gaveta)} · cofre ${brl(cofre)}`)
console.log(`\nRESUMO: a gaveta nunca sai de ${brl(gaveta)}. O dinheiro vive no cofre e o app passa a ver os dois.`)
