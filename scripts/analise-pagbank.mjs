// Análise READ-ONLY do extrato PagBank (30/09 a 01/11) e cruzamento com o app.
// Uso: node scripts/analise-pagbank.mjs
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const P = 1000
async function tudo(q) { const o = []; for (let i = 0; i < 900000; i += P) { const { data, error } = await q(i, i + P - 1); if (error) throw new Error(error.message); o.push(...data); if (data.length < P) break } return o }

const txt = fs.readFileSync('docs/fechamento/2026-10/entrada/05-pagbank-30-09-a-01-11.csv', 'utf8').replace(/^\uFEFF/, '')
const linhas = txt.split(/\r?\n/).filter(Boolean)
linhas.shift()
const rows = linhas.map((l) => {
  const p = l.split(';')
  return { cod: p[0], data: p[1], tipo: p[2], desc: p[3] ?? '', valor: Number((p[4] ?? '').replace(/\./g, '').replace(',', '.')) || 0 }
}).filter((r) => r.data)
const brl = (n) => 'R$ ' + (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ehPJ = (d) => /LTDA|EIRELI|S\/A|S\.A|COMERCIO|COMÉRCIO|TECNOLOGIA|DISTRIBUIDORA|MERCADO|CELL|CELULAR/i.test(d)

console.log('=== EXTRATO PAGBANK ===')
console.log('linhas:', rows.length, '| periodo:', rows[0].data, '->', rows[rows.length - 1].data)
const tipos = {}
for (const r of rows) { tipos[r.tipo] ??= { n: 0, v: 0 }; tipos[r.tipo].n++; tipos[r.tipo].v += r.valor }
for (const [k, v] of Object.entries(tipos).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v))) console.log(String(v.n).padStart(4), brl(v.v).padStart(14), k)
const porMes = {}
for (const r of rows) { const m = r.data.slice(3, 10); porMes[m] ??= { n: 0, ent: 0, sai: 0 }; porMes[m].n++; if (r.valor > 0) porMes[m].ent += r.valor; else porMes[m].sai += r.valor }
console.log('\npor mês:')
for (const [k, v] of Object.entries(porMes)) console.log('  ', k, String(v.n).padStart(4), 'entrou', brl(v.ent).padStart(13), 'saiu', brl(v.sai).padStart(13), 'líquido', brl(v.ent + v.sai))
console.log('\n15 maiores SAÍDAS:')
for (const r of rows.filter((r) => r.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, 15)) console.log('  ', r.data, String(r.valor.toFixed(2)).padStart(11), r.tipo, '|', r.desc.slice(0, 46))
const pj = {}
for (const r of rows.filter((r) => ehPJ(r.desc))) { pj[r.desc] ??= { n: 0, v: 0 }; pj[r.desc].n++; pj[r.desc].v += r.valor }
console.log('\ncontrapartes que parecem empresa (top 12):')
for (const [k, v] of Object.entries(pj).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v)).slice(0, 12)) console.log(String(v.n).padStart(4), brl(v.v).padStart(13), k.slice(0, 48))

// ── cruzamento com o app (outubro) ──────────────────────────────────────────
const INI = '2026-10-01', FIM = '2026-11-01' // fim exclusivo
const deTs = INI + 'T00:00:00-03:00', ateTs = FIM + 'T00:00:00-03:00'
const dentro = (d) => { const [dd, mm, aa] = d.split('/'); const iso = `${aa}-${mm}-${dd}`; return iso >= INI && iso < FIM }

const { data: formas } = await s.from('formas_pagamento').select('id, nome, tipo')
const formaDe = new Map(formas.map((f) => [f.id, f]))
const lojas = await tudo((a, b) => s.from('lojas').select('id, nome').range(a, b))
const deps = await tudo((a, b) => s.from('depositos').select('id, loja_id').range(a, b))
const cxs = await tudo((a, b) => s.from('caixas').select('id, loja_id').range(a, b))
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))
const lojaCx = new Map(cxs.map((c) => [c.id, c.loja_id]))

const vendas = await tudo((a, b) => s.from('vendas').select('id, deposito_id').eq('status', 'concluida').eq('uso_interno', false).gte('data', deTs).lt('data', ateTs).order('id').range(a, b))
const vendaLoja = new Map(vendas.map((v) => [v.id, lojaDep.get(v.deposito_id)]))
const pags = []
for (let i = 0; i < vendas.length; i += 200) {
  const lote = vendas.slice(i, i + 200).map((v) => v.id)
  pags.push(...await tudo((a, b) => s.from('pagamentos_venda').select('venda_id, valor, forma_pagamento_id, status').eq('status', 'pago').in('venda_id', lote).range(a, b)))
}
const receb = await tudo((a, b) => s.from('movimentos_caixa').select('tipo, forma_pagamento, valor, caixa_id').gte('created_at', deTs).lt('created_at', ateTs).range(a, b))

const appPorForma = {}
const add = (k, v) => { appPorForma[k] = (appPorForma[k] ?? 0) + v }
for (const p of pags) { const f = formaDe.get(p.forma_pagamento_id); add((f?.nome ?? '?') + ' [' + (f?.tipo ?? '?') + ']', p.valor ?? 0) }
for (const r of receb) if (r.tipo === 'recebimento') add('FIXADO recebimento ' + (r.forma_pagamento ?? '?'), r.valor ?? 0)

console.log('\n=== APP: entradas de outubro por forma (vendas pagas + fiado recebido) ===')
for (const [k, v] of Object.entries(appPorForma).sort((a, b) => b[1] - a[1])) console.log(brl(v).padStart(14), k)

// pagbank outubro por tipo
const pb = rows.filter((r) => dentro(r.data))
const pbTipo = {}
for (const r of pb) { pbTipo[r.tipo] ??= { n: 0, v: 0 }; pbTipo[r.tipo].n++; pbTipo[r.tipo].v += r.valor }
console.log('\n=== PAGBANK: outubro por tipo ===')
for (const [k, v] of Object.entries(pbTipo).sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v))) console.log(String(v.n).padStart(4), brl(v.v).padStart(14), k)

const totalPixRec = pb.filter((r) => /Pix recebido/i.test(r.tipo)).reduce((t, r) => t + r.valor, 0)
const totalPixEnv = pb.filter((r) => /Pix enviado/i.test(r.tipo)).reduce((t, r) => t + r.valor, 0)
console.log('\nPagBank outubro: Pix recebido', brl(totalPixRec), '| Pix enviado', brl(totalPixEnv), '| líquido', brl(totalPixRec + totalPixEnv))

// app: PIX de vendas + PIX de fiado recebido
const appPixVendas = Object.entries(appPorForma).filter(([k]) => /\[pix\]/i.test(k)).reduce((t, [, v]) => t + v, 0)
const appPixFiado = Object.entries(appPorForma).filter(([k]) => /^FIXADO recebimento pix/i.test(k)).reduce((t, [, v]) => t + v, 0)
console.log('app PIX de vendas', brl(appPixVendas), '| app PIX de fiado recebido', brl(appPixFiado), '| soma', brl(appPixVendas + appPixFiado))
const appCartao = Object.entries(appPorForma).filter(([k]) => /\[(cartao|cartão|credito|debito)\]|TON|PagBank/i.test(k) && !/\[pix\]/i.test(k)).reduce((t, [, v]) => t + v, 0)
console.log('app cartão (vendas) ', brl(appCartao))
