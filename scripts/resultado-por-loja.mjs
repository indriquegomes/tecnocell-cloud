// READ-ONLY: resultado de outubro POR LOJA (venda, custo, despesa) + dinheiro por loja.
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

const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')
const deps = await pagina('depositos', 'id, loja_id')
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))
const L = (id) => lojas.find((l) => l.id === id)?.nome ?? '(sem loja)'

// vendas do mês por loja
const vendas = await pagina('vendas', 'id, total, deposito_id', (q) => q.eq('status', 'concluida').eq('uso_interno', false).gte('data', de).lt('data', ate))
const vendaLoja = new Map(vendas.map((v) => [v.id, lojaDep.get(v.deposito_id)]))
const vendaPor = {}
for (const v of vendas) { const k = L(vendaLoja.get(v.id)); vendaPor[k] = (vendaPor[k] ?? 0) + Number(v.total ?? 0) }

// devoluções por loja
const devol = await pagina('devolucoes', 'valor_total, deposito_id', (q) => q.gte('created_at', de).lt('created_at', ate))
const devPor = {}
for (const d of devol) { const k = L(lojaDep.get(d.deposito_id)); devPor[k] = (devPor[k] ?? 0) + Number(d.valor_total ?? 0) }

// compras (itens de nota) por loja
const notas = await pagina('notas_entrada', 'id', (q) => q.gte('data_entrada', '2026-10-01').lt('data_entrada', '2026-11-01'))
const nIds = new Set(notas.map((n) => n.id))
const itens = (await pagina('itens_nota_entrada', 'nota_id, deposito_id, total_item')).filter((i) => nIds.has(i.nota_id))
const compraPor = {}
for (const it of itens) { const k = L(lojaDep.get(it.deposito_id)); compraPor[k] = (compraPor[k] ?? 0) + Number(it.total_item ?? 0) }

// estoque a custo por loja (fechamento) e abertura do papel 30/09
const produtos = await pagina('produtos', 'id, preco_custo')
const custoDe = new Map(produtos.map((p) => [p.id, Number(p.preco_custo ?? 0)]))
const estoque = await pagina('estoque', 'produto_id, deposito_id, quantidade', (q) => q.gt('quantidade', 0))
const estoquePor = {}
for (const e of estoque) { const k = L(lojaDep.get(e.deposito_id)); estoquePor[k] = (estoquePor[k] ?? 0) + Number(e.quantidade ?? 0) * (custoDe.get(e.produto_id) ?? 0) }
const abertura = { Petrópolis: 270128.74, Teresópolis: 185000.40 } // contagem física 30/09 (grupo do WhatsApp, sem biscoitos/chocolates)

// despesas pagas no app, por loja, sem mercadoria/vale/uso interno
const desp = await pagina('lancamentos', 'valor, categoria, loja_id', (q) => q.eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', de).lt('data_pagamento', ate))
const EXCLUIR = new Set(['Fornecedor / Mercadoria', 'Mercadoria', 'Vale crédito usado', 'Uso interno'])
const despPor = {}
void desp
for (const d of desp) {
  if (EXCLUIR.has(d.categoria ?? '')) continue
  const k = L(d.loja_id)
  despPor[k] = (despPor[k] ?? 0) + Number(d.valor ?? 0)
}

console.log('RESULTADO DE OUTUBRO POR LOJA')
console.log('| Loja | Venda | Devolução | Venda líquida | Comprou (nota) | Estoque 30/09 | Estoque hoje | Custo vendido | Despesas | Resultado |')
console.log('|---|---|---|---|---|---|---|---|---|---|')
let t = { v: 0, d: 0, c: 0, custo: 0, desp: 0, res: 0 }
for (const l of lojas) {
  const n = l.nome
  const v = vendaPor[n] ?? 0
  const d = devPor[n] ?? 0
  const c = compraPor[n] ?? 0
  const est = estoquePor[n] ?? 0
  const cmv = (abertura[n] ?? 0) + c - est
  const des = despPor[n] ?? 0
  const res = v - d - cmv - des
  t.v += v; t.d += d; t.c += c; t.custo += cmv; t.desp += des; t.res += res
  console.log(`| **${n}** | ${brl(v)} | ${brl(d)} | ${brl(v - d)} | ${brl(c)} | ${brl(abertura[n] ?? 0)} | ${brl(est)} | ${brl(cmv)} | ${brl(des)} | **${brl(res)}** |`)
}
console.log(`| **TOTAL** | ${brl(t.v)} | ${brl(t.d)} | ${brl(t.v - t.d)} | ${brl(t.c)} | ${brl(455129.14)} | ${brl(estoquePor['Petrópolis'] + estoquePor['Teresópolis'])} | ${brl(t.custo)} | ${brl(t.desp)} | **${brl(t.res)}** |`)
console.log()
console.log('Dinheiro em mãos (contagem do dono, 01/11): Petrópolis R$ 32.163,00 · Teresópolis R$ 27.000,00 = R$ 59.163,00')
console.log('PagBank (uma conta só, não separa loja): entrou R$ 86.781,48 · saiu R$ 77.688,75 · líquido +R$ 9.092,73')
