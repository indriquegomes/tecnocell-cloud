// READ-ONLY: resultado de outubro/2026 no recorte 01/10 → 28/10 (decisão do dono 26/10).
// As notas de 29/10 ficam para novembro: ficam fora das compras E o estoque final é o de 28/10.
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
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const INI = '2026-10-01', FIM = '2026-10-29' // FIM exclusivo: entra até 28/10
const deTs = INI + 'T00:00:00-03:00', ateTs = FIM + 'T00:00:00-03:00'
const CORTE = '2026-10-28T23:59:59-03:00'

const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')
const deps = await pagina('depositos', 'id, loja_id')
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))
const L = (id) => lojas.find((l) => l.id === id)?.nome ?? '(sem loja)'

// vendas 01–28
const vendas = await pagina('vendas', 'id, total, deposito_id', (q) => q.eq('status', 'concluida').eq('uso_interno', false).gte('data', deTs).lt('data', ateTs))
const vendaLoja = new Map(vendas.map((v) => [v.id, lojaDep.get(v.deposito_id)]))
const vendaPor = {}
for (const v of vendas) { const k = L(vendaLoja.get(v.id)); vendaPor[k] = (vendaPor[k] ?? 0) + Number(v.total ?? 0) }

// devoluções 01–28
const devol = await pagina('devolucoes', 'valor_total, deposito_id', (q) => q.gte('created_at', deTs).lt('created_at', ateTs))
const devPor = {}
for (const d of devol) { const k = L(lojaDep.get(d.deposito_id)); devPor[k] = (devPor[k] ?? 0) + Number(d.valor_total ?? 0) }

// compras: notas de 01 a 28 (fora as de 29)
const notas = await pagina('notas_entrada', 'id, data_entrada', (q) => q.gte('data_entrada', INI).lt('data_entrada', FIM))
const nIds = new Set(notas.map((n) => n.id))
const itens = (await pagina('itens_nota_entrada', 'nota_id, deposito_id, total_item')).filter((i) => nIds.has(i.nota_id))
const compraPor = {}
for (const it of itens) { const k = L(lojaDep.get(it.deposito_id)); compraPor[k] = (compraPor[k] ?? 0) + Number(it.total_item ?? 0) }
const compraTotal = Object.values(compraPor).reduce((a, b) => a + b, 0)

// estoque a custo em 28/10 (reconstruído pelos movimentos)
const produtos = await pagina('produtos', 'id, preco_custo')
const custoDe = new Map(produtos.map((p) => [p.id, Number(p.preco_custo ?? 0)]))
const estoqueAtual = await pagina('estoque', 'produto_id, deposito_id, quantidade')
const movs = await pagina('movimentacoes_estoque', 'produto_id, deposito_id, qtd_anterior, qtd_nova, created_at', null, 'created_at')
const depois = new Map()
for (const m of movs) {
  if (m.created_at <= CORTE) continue
  const k = m.produto_id + '|' + m.deposito_id
  if (!depois.has(k)) depois.set(k, m)
}
const atual = new Map()
for (const e of estoqueAtual) atual.set(e.produto_id + '|' + e.deposito_id, Number(e.quantidade ?? 0))
const estoquePor = {}
const chaves = new Set([...atual.keys(), ...depois.keys()])
for (const k of chaves) {
  const [pid, dep] = k.split('|')
  const qtd = depois.has(k) ? Number(depois.get(k).qtd_anterior ?? 0) : Number(atual.get(k) ?? 0)
  if (!qtd) continue
  const loja = L(lojaDep.get(dep))
  estoquePor[loja] = (estoquePor[loja] ?? 0) + qtd * (custoDe.get(pid) ?? 0)
}
const ABERTURA = { Petrópolis: 270128.74, Teresópolis: 185000.40 } // contagem física 30/09

// despesas pagas 01–28 (sem mercadoria/vale/uso interno)
const desp = await pagina('lancamentos', 'valor, categoria, loja_id', (q) => q.eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', deTs).lt('data_pagamento', ateTs))
const EXCLUIR = new Set(['Fornecedor / Mercadoria', 'Mercadoria', 'Vale crédito usado', 'Uso interno'])
const despPor = {}
for (const d of desp) { if (EXCLUIR.has(d.categoria ?? '')) continue; const k = L(d.loja_id); despPor[k] = (despPor[k] ?? 0) + Number(d.valor ?? 0) }

console.log('RESULTADO — 01/10 a 28/10/2026 (notas de 29/10 fora)')
console.log('| Loja | Venda | Devolução | Comprou (01–28) | Estoque 30/09 | Estoque 28/10 | Custo vendido | Despesas | Resultado |')
console.log('|---|---|---|---|---|---|---|---|---|')
let T = { v: 0, d: 0, c: 0, est: 0, cmv: 0, desp: 0, res: 0 }
for (const l of lojas) {
  const n = l.nome
  const v = vendaPor[n] ?? 0, d = devPor[n] ?? 0, c = compraPor[n] ?? 0
  const est = estoquePor[n] ?? 0
  const cmv = (ABERTURA[n] ?? 0) + c - est
  const des = despPor[n] ?? 0
  const res = v - d - cmv - des
  T.v += v; T.d += d; T.c += c; T.est += est; T.cmv += cmv; T.desp += des; T.res += res
  console.log(`| **${n}** | ${brl(v)} | ${brl(d)} | ${brl(c)} | ${brl(ABERTURA[n] ?? 0)} | ${brl(est)} | ${brl(cmv)} | ${brl(des)} | **${brl(res)}** |`)
}
console.log(`| **TOTAL** | ${brl(T.v)} | ${brl(T.d)} | ${brl(T.c)} | ${brl(455129.14)} | ${brl(T.est)} | ${brl(T.cmv)} | ${brl(T.desp)} | **${brl(T.res)}** |`)
console.log()
console.log('Variação de estoque no período:', brl(T.est - 455129.14))
console.log('Margem bruta:', brl(T.v - T.d - T.cmv), '=', (((T.v - T.d - T.cmv) / (T.v - T.d)) * 100).toFixed(1) + '% da venda líquida')
console.log()
console.log('Notas de 29/10 (ficam para novembro):', brl(95553.00), 'em 19 notas')
console.log('Notas de 01–28:', notas.length, '·', brl(compraTotal))
