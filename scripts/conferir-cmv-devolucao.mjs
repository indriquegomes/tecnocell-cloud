// SÓ LEITURA — impacto das duas réguas de devolução no DRE do mês.
//   A) como estava: abate receita e custo de TODA devolução, custo pelo cadastro
//   B) como ficou:  abate receita só quando o dinheiro voltou; custo só quando a peça
//                   voltou ao estoque, pelo custo travado na venda
// Uso: node scripts/conferir-cmv-devolucao.mjs 2026-11
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const P = 1000
async function tudo(q) { const o = []; for (let i = 0; i < 400000; i += P) { const { data, error } = await q(i, i + P - 1); if (error) throw new Error(error.message); if (!data?.length) break; o.push(...data); if (data.length < P) break } return o }
async function tudoIn(ids, make, chunk = 200) { const o = []; for (let i = 0; i < ids.length; i += chunk) { const c = ids.slice(i, i + chunk); o.push(...await tudo((a, b) => make(c, a, b))) } return o }

const mes = process.argv[2] ?? '2026-11'
const lojaNome = process.argv[3] ?? null
const [ano, m] = mes.split('-').map(Number)
const inicio = `${mes}-01T00:00:00-03:00`
const fim = m === 12 ? `${ano + 1}-01-01T00:00:00-03:00` : `${ano}-${String(m + 1).padStart(2, '0')}-01T00:00:00-03:00`

// filtro de loja igual ao do DRE: venda entra se o caixa dela é da loja
let caixasDaLoja = null
let depositosDaLoja = null
if (lojaNome) {
  const { data: lojas } = await s.from('lojas').select('id, nome').ilike('nome', `%${lojaNome}%`)
  const loja = (lojas ?? [])[0]
  if (!loja) { console.error('loja não encontrada:', lojaNome); process.exit(1) }
  const { data: cxs } = await s.from('caixas').select('id').eq('loja_id', loja.id)
  caixasDaLoja = new Set((cxs ?? []).map((c) => c.id))
  const { data: deps } = await s.from('depositos').select('id').eq('loja_id', loja.id)
  depositosDaLoja = new Set((deps ?? []).map((d) => d.id))
  console.log(`loja: ${loja.nome} · ${caixasDaLoja.size} caixa(s) · ${depositosDaLoja.size} depósito(s)`)
}

// vendas do mês (itens com custo travado)
const itens = await tudo((f, t) => {
  let q = s.from('itens_venda')
    .select('venda_id, produto_id, quantidade, total_item, custo_unitario, produtos(preco_custo), vendas!inner(created_at, status, caixa_id)')
    .eq('vendas.status', 'concluida').gte('vendas.created_at', inicio).lt('vendas.created_at', fim)
  if (caixasDaLoja) q = q.in('vendas.caixa_id', [...caixasDaLoja])
  return q.order('id').range(f, t)
})
let vendido = 0, custoVenda = 0
const custoTravado = new Map()
for (const it of itens) {
  const qtd = Number(it.quantidade) || 0
  const valor = Number(it.total_item) || 0
  const prods = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos
  const custoUnit = it.custo_unitario != null ? Number(it.custo_unitario) : Number(prods?.preco_custo ?? 0)
  vendido += valor
  custoVenda += custoUnit * qtd
  custoTravado.set(`${it.venda_id}|${it.produto_id}`, custoUnit)
}

// devoluções do mês
const devs = await tudo((f, t) => {
  let q = s.from('devolucoes')
    .select('id, venda_id, tipo_credito, valor_total, deposito_id').gte('created_at', inicio).lt('created_at', fim)
  if (depositosDaLoja) q = q.in('deposito_id', [...depositosDaLoja])
  return q.order('id').range(f, t)
})
const devInfo = new Map(devs.map((d) => [d.id, d]))
const devItens = devs.length ? await tudoIn(devs.map((d) => d.id), (chunk, a, b) => s.from('itens_devolucao')
  .select('devolucao_id, produto_id, quantidade, total_item, status_produto').in('devolucao_id', chunk).order('id').range(a, b)) : []
const pids = [...new Set(devItens.map((i) => i.produto_id).filter(Boolean))]
const prods = pids.length ? await tudoIn(pids, (chunk, a, b) => s.from('produtos').select('id, preco_custo').in('id', chunk).order('id').range(a, b)) : []
const custoCadastro = new Map(prods.map((p) => [p.id, Number(p.preco_custo ?? 0)]))

let revA = 0, custoA = 0, revB = 0, custoB = 0
const porTipo = {}
for (const it of devItens) {
  const info = devInfo.get(it.devolucao_id)
  const qtd = Number(it.quantidade) || 0
  const valor = Number(it.total_item) || 0
  const voltou = (it.status_produto ?? 'ok') === 'ok'
  const dinheiroVoltou = (info?.tipo_credito ?? '') !== 'sem_reembolso'
  const cTravado = custoTravado.get(`${info?.venda_id}|${it.produto_id}`) ?? custoCadastro.get(it.produto_id) ?? 0
  revA += valor; custoA += (custoCadastro.get(it.produto_id) ?? 0) * qtd
  if (dinheiroVoltou) revB += valor
  if (voltou) custoB += cTravado * qtd
  const k = `${info?.tipo_credito ?? '?'} × ${it.status_produto ?? 'null'}`
  porTipo[k] = porTipo[k] ?? { n: 0, rev: 0, custoB: 0 }
  porTipo[k].n += qtd
  porTipo[k].rev += dinheiroVoltou ? valor : 0
  porTipo[k].custoB += voltou ? cTravado * qtd : 0
}

const lucroA = (vendido - revA) - (custoVenda - custoA)
const lucroB = (vendido - revB) - (custoVenda - custoB)

console.log(`\n${mes} — DRE do mês`)
console.log(`  vendas concluídas:      R$ ${brl(vendido).padStart(12)}`)
console.log(`  custo das vendas (CMV): R$ ${brl(custoVenda).padStart(12)}`)
console.log(`\n  A) régua antiga:  receita devolvida R$ ${brl(revA)} · custo devolvido R$ ${brl(custoA)} → lucro R$ ${brl(lucroA)}`)
console.log(`  B) régua nova:    receita devolvida R$ ${brl(revB)} · custo devolvido R$ ${brl(custoB)} → lucro R$ ${brl(lucroB)}`)
console.log(`  diferença: R$ ${brl(lucroB - lucroA)}`)
console.log('\n  por tipo de crédito × status da peça (régua nova):')
for (const [k, v] of Object.entries(porTipo).sort((a, b) => b[1].custoB - a[1].custoB)) {
  console.log(`    ${k.padEnd(34)} ${String(v.n).padStart(4)} peça(s) · receita devolvida ${brl(v.rev).padStart(10)} · custo devolvido ${brl(v.custoB).padStart(10)}`)
}
