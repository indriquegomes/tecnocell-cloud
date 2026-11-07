// READ-ONLY. (1) Resultado de outubro corrigido: só entra como compra a nota que ENTROU no estoque;
// estoque final em 31/10. (2) Análise da planilha INOVA que o dono colou.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
async function P(t, c, f, o = 'id') { const r = []; for (let p = 0; ; p++) { let q = s.from(t).select(c); if (f) q = f(q); const { data, error } = await q.order(o).range(p * 1000, p * 1000 + 999); if (error) throw new Error(t + ': ' + error.message); if (!data.length) break; r.push(...data); if (data.length < 1000) break } return r }
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const INI = '2026-10-01T00:00:00-03:00', FIM = '2026-11-01T00:00:00-03:00'

// ── 1. resultado corrigido ──────────────────────────────────────────
const { data: lojas } = await s.from('lojas').select('id, nome')
const deps = await P('depositos', 'id, loja_id')
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))
const L = (id) => lojas.find((l) => l.id === id)?.nome ?? '(sem)'
const produtos = await P('produtos', 'id, preco_custo')
const custo = new Map(produtos.map((p) => [p.id, Number(p.preco_custo ?? 0)]))
const atual = await P('estoque', 'produto_id, deposito_id, quantidade')
const movs = await P('movimentacoes_estoque', 'produto_id, deposito_id, qtd_anterior, created_at', null, 'created_at')
function estoqueEm(corte) {
  const depois = new Map()
  for (const m of movs) { if (m.created_at <= corte) continue; const k = m.produto_id + '|' + m.deposito_id; if (!depois.has(k)) depois.set(k, m) }
  const at = new Map(); for (const e of atual) at.set(e.produto_id + '|' + e.deposito_id, Number(e.quantidade ?? 0))
  const por = {}
  for (const k of new Set([...at.keys(), ...depois.keys()])) {
    const [pid, dep] = k.split('|')
    const q = depois.has(k) ? Number(depois.get(k).qtd_anterior ?? 0) : Number(at.get(k) ?? 0)
    const loja = L(lojaDep.get(dep))
    por[loja] = (por[loja] ?? 0) + q * (custo.get(pid) ?? 0)
  }
  return por
}
// vendas / devoluções / despesas do mês inteiro
const vendas = await P('vendas', 'id, total, deposito_id', (q) => q.eq('status', 'concluida').eq('uso_interno', false).gte('data', INI).lt('data', FIM))
const vl = new Map(vendas.map((v) => [v.id, lojaDep.get(v.deposito_id)]))
const vP = {}; for (const v of vendas) { const k = L(vl.get(v.id)); vP[k] = (vP[k] ?? 0) + Number(v.total ?? 0) }
const dev = await P('devolucoes', 'valor_total, deposito_id', (q) => q.gte('created_at', INI).lt('created_at', FIM))
const dP = {}; for (const d of dev) { const k = L(lojaDep.get(d.deposito_id)); dP[k] = (dP[k] ?? 0) + Number(d.valor_total ?? 0) }
const despesas = await P('lancamentos', 'valor, categoria, loja_id', (q) => q.eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', INI).lt('data_pagamento', FIM))
const EX = new Set(['Fornecedor / Mercadoria', 'Mercadoria', 'Vale crédito usado', 'Uso interno'])
const dsP = {}; for (const d of despesas) { if (EX.has(d.categoria ?? '')) continue; const k = L(d.loja_id); dsP[k] = (dsP[k] ?? 0) + Number(d.valor ?? 0) }
// compras que ENTRARAM no estoque (notas até 28/10)
const notas = await P('notas_entrada', 'id', (q) => q.gte('data_entrada', '2026-10-01').lt('data_entrada', '2026-10-29'))
const nIds = new Set(notas.map((n) => n.id))
const itens = (await P('itens_nota_entrada', 'nota_id, deposito_id, total_item')).filter((i) => nIds.has(i.nota_id))
const cP = {}; for (const it of itens) { const k = L(lojaDep.get(it.deposito_id)); cP[k] = (cP[k] ?? 0) + Number(it.total_item ?? 0) }

const AB = { Petrópolis: 270128.74, Teresópolis: 185000.40 }
const EF = estoqueEm('2026-10-31T23:59:59-03:00')
console.log('## RESULTADO DE OUTUBRO (corrigido)')
console.log('Regra: entra como compra só a nota que ENTRou no estoque. As 19 notas de 29/10 (R$ 95.553) não movimentaram estoque e ficam para novembro.')
console.log()
console.log('| Loja | Venda | Devolução | Comprou (estoque) | Estoque 30/09 | Estoque 31/10 | Custo vendido | Despesas | Resultado |')
console.log('|---|---|---|---|---|---|---|---|---|')
let T = { v: 0, d: 0, c: 0, e: 0, cmv: 0, ds: 0, r: 0 }
for (const l of lojas) {
  const n = l.nome
  const v = vP[n] ?? 0, d = dP[n] ?? 0, c = cP[n] ?? 0, ef = EF[n] ?? 0
  const cmv = (AB[n] ?? 0) + c - ef
  const ds = dsP[n] ?? 0
  const r = v - d - cmv - ds
  T.v += v; T.d += d; T.c += c; T.e += ef; T.cmv += cmv; T.ds += ds; T.r += r
  console.log(`| **${n}** | ${brl(v)} | ${brl(d)} | ${brl(c)} | ${brl(AB[n])} | ${brl(ef)} | ${brl(cmv)} | ${brl(ds)} | **${brl(r)}** |`)
}
console.log(`| **TOTAL** | ${brl(T.v)} | ${brl(T.d)} | ${brl(T.c)} | ${brl(455129.14)} | ${brl(T.e)} | ${brl(T.cmv)} | ${brl(T.ds)} | **${brl(T.r)}** |`)
console.log()
console.log('margem bruta:', brl(T.v - T.d - T.cmv), '=', (((T.v - T.d - T.cmv) / (T.v - T.d)) * 100).toFixed(1) + '% da venda líquida')
console.log('estoque: 30/09', brl(455129.14), '→ 31/10', brl(T.e), '· variação', brl(T.e - 455129.14))
console.log()

// ── 2. planilha INOVA colada pelo dono ─────────────────────────────
const compras = [800.00, 28025.00, -325.80, 53300.05, -3650.85, -2260.28, 11542.60, 84346.00, -509.75, -104.75, -321.14, -366.80, -134.10, -356.00, 29773.02, 2380.00, 2838.60, -228.60, 48495.78, 18069.00, -72.00, -270.00, 5328.90]
// pagamentos: [valor, período] — em ordem da planilha
const pagos = [
  [2870.00, '28/5-3/6'], [1100.00, '28/5-3/6'], [3300.00, '4/6-22/6'], [1700.00, '4/6-22/6'], [654.00, '23/6-2/7'], [1920.00, '23/6-2/7'],
  [1270.00, '3/7-9/7'], [1180.00, '3/7-9/7'], [1800.00, '10/7-21/7'], [750.00, '10/7-21/7'], [3000.00, '22/7-3/8'], [3140.00, '22/7-3/8'],
  [2058.00, 's/periodo'], [3505.00, 's/periodo'], [319.00, 's/periodo'], [638.71, '11/8-24/8'], [8000.00, '11/8-24/8'], [3000.00, '11/8-24/8'],
  [3367.00, '25/8-8/9'], [6552.00, '25/8-8/9'], [235.00, '9/9-15/9'], [2000.00, '9/9-15/9'], [856.00, '9/9-15/9'],
  [5569.41, '16/9-30/9'], [1940.00, '16/9-30/9'],
  [1500.00, '1/10-7/10'], [1254.00, '1/10-7/10'], [2260.00, '8/10-14/10'], [2000.00, '16/9-30/9'], [1975.00, '8/10-14/10'],
  [755.00, '15/10-22/10'], [1120.00, '15/10-22/10'], [586.00, 's/periodo'],
  [2460.00, '23/10-3/11'], [810.00, '23/10-3/11'],
  [3520.00, '04/11-23/11'], [12016.00, '04/11-23/11'], [5000.00, '24/11-30/11'], [2000.00, '24/11-30/11'],
  [12500.00, '01/12-31/12'], [5000.00, '01/12-31/12'], [9400.00, '01/01-31/01'], [5000.00, '01/01-31/01'],
  [6213.00, '01/02-28/2'], [3787.00, '01/02-28/2'], [3846.00, '02/3-31/3'], [6854.00, '02/3-31/3'],
  [4000.00, '1-15/4'], [4200.00, '1-15/4'], [5670.00, '16/4-30/4'], [4350.00, '16/4-30/4'],
  [1184.06, '03/06'], [4621.00, '1/6-16/6'], [6490.00, '1/6-16/6'], [2200.00, '17/6-30/6'], [5300.00, '17/6-30/6'],
  [1800.00, '1/7-15/7'], [3800.00, '1/7-15/7'], [3100.00, '16/7-31/7'], [2500.00, '16/7-31/7'], [2234.00, '1/8-15/8'], [2718.00, '1/8-15/8'],
  [6000.00, '24/8-8/09'], [5650.00, '24/8-8/09'], [5700.00, '9/9-30/09'], [3600.00, '9/9-30/09'],
  [5315.20, 'pet 1/10-20/10'], [9791.20, 'tere 1/10-20/10'],
]
const somaCompras = compras.reduce((a, b) => a + b, 0)
const somaPagos = pagos.reduce((t, p) => t + p[0], 0)
const outubro = pagos.filter(([, per]) => /1\/10|8\/10|15\/10|1\/10-20\/10/.test(per)).reduce((t, p) => t + p[0], 0)
const programado = pagos.filter(([, per]) => /\/11|\/12|\/01|\/02|\/3-|\/4|1\/6|17\/6|1\/7|16\/7|1\/8|24\/8|9\/9-30/.test(per)).reduce((t, p) => t + p[0], 0)
console.log('## PLANILHA INOVA (colada pelo dono)')
console.log('- compras lançadas na planilha:', brl(somaCompras))
console.log('- pagamentos lançados (todas as linhas):', brl(somaPagos), '·', pagos.length, 'linhas')
console.log('- pagamentos de OUTUBRO (1/10-20/10):', brl(outubro))
console.log('- pagamentos programados (23/10 em diante):', brl(programado))
console.log('- saldo simples (compras − pagamentos totais):', brl(somaCompras - somaPagos))
fs.writeFileSync('docs/registros/2026-10/resultado-corrigido-e-inova.md', '# Resultado corrigido e INOVA\n\nver console\n', 'utf8')
