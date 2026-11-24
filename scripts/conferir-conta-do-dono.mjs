// SÓ LEITURA — a conta que o dono propôs:
//   (1) entrada de pagamentos × saída de itens
//   (2) estoque × dívida para fornecedor
//
// Metade (1) é IGUALDADE: toda peça que sai tem que estar paga ou no fiado.
// Metade (2) NÃO é igualdade: estoque e dívida são dois fatos independentes; o que se
// compara é estoque do sistema × contagem e dívida do sistema × extrato do fornecedor.
// Aqui mostramos os dois números e a relação (quanto do estoque o fornecedor financia).
//
// Uso: node scripts/conferir-conta-do-dono.mjs 2026-11
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
const [ano, m] = mes.split('-').map(Number)
const de = `${mes}-01`
const ate = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
const inicio = de + 'T00:00:00-03:00'
const fim = ate + 'T00:00:00-03:00'
const MERC = /mercadoria|fornecedor\s*\/?\s*mercadoria|fonecedor/i

const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')

console.log(`\n########## METADE 1 — ENTRADA DE PAGAMENTOS × SAÍDA DE ITENS (${mes}) ##########`)
let geral = { pago: 0, fiado: 0, venda: 0, custo: 0, devolvido: 0, devolvidoRev: 0 }
for (const loja of lojas ?? []) {
  const { data: cxs } = await s.from('caixas').select('id').eq('loja_id', loja.id)
  const caixas = (cxs ?? []).map((c) => c.id)
  const { data: deps } = await s.from('depositos').select('id').eq('loja_id', loja.id)
  const depIds = (deps ?? []).map((d) => d.id)

  const vendas = await tudo((f, t) => s.from('vendas').select('id, total, caixa_id').eq('status', 'concluida').eq('uso_interno', false)
    .gte('created_at', inicio).lt('created_at', fim).order('id').range(f, t))
  const vs = vendas.filter((v) => v.caixa_id && caixas.includes(v.caixa_id))
  const ids = vs.map((v) => v.id)
  const vendaBruta = vs.reduce((t, v) => t + Number(v.total ?? 0), 0)

  const pags = ids.length ? await tudoIn(ids, (c, a, b) => s.from('pagamentos_venda').select('forma_pagamento_id, valor').in('venda_id', c).order('id').range(a, b)) : []
  const { data: formas } = await s.from('formas_pagamento').select('id, tipo')
  const tipoDe = new Map((formas ?? []).map((f) => [f.id, f.tipo]))
  const totalPago = pags.reduce((t, p) => t + Number(p.valor ?? 0), 0)
  const fiado = pags.filter((p) => tipoDe.get(p.forma_pagamento_id) === 'fiado').reduce((t, p) => t + Number(p.valor ?? 0), 0)

  const itens = ids.length ? await tudoIn(ids, (c, a, b) => s.from('itens_venda').select('quantidade, total_item, custo_unitario, produtos(preco_custo)').in('venda_id', c).order('id').range(a, b)) : []
  let custoBruto = 0, itensValor = 0
  for (const it of itens) {
    const pr = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos
    const cu = it.custo_unitario != null ? Number(it.custo_unitario) : Number(pr?.preco_custo ?? 0)
    custoBruto += cu * Number(it.quantidade || 0)
    itensValor += Number(it.total_item || 0)
  }

  // devoluções do mês (peça que voltou abate item e custo)
  const devs = await tudo((f, t) => s.from('devolucoes').select('id, venda_id, tipo_credito').gte('created_at', inicio).lt('created_at', fim).in('deposito_id', depIds).order('id').range(f, t))
  const devInfo = new Map(devs.map((d) => [d.id, d]))
  const dItens = devs.length ? await tudoIn(devs.map((d) => d.id), (c, a, b) => s.from('itens_devolucao').select('devolucao_id, produto_id, quantidade, total_item, status_produto').in('devolucao_id', c).order('id').range(a, b)) : []
  const custosVenda = new Map()
  for (const it of itens) { /* custo por venda+produto não vem aqui; usa cadastro abaixo */ }
  const pids = [...new Set(dItens.map((i) => i.produto_id).filter(Boolean))]
  const prods = pids.length ? await tudoIn(pids, (c, a, b) => s.from('produtos').select('id, preco_custo').in('id', c).order('id').range(a, b)) : []
  const custoCad = new Map(prods.map((p) => [p.id, Number(p.preco_custo ?? 0)]))
  let qtdDevolvida = 0, devolvidoValor = 0, devolvidoRev = 0, custoDevolvido = 0
  for (const it of dItens) {
    const d = devInfo.get(it.devolucao_id)
    const q = Number(it.quantidade || 0)
    qtdDevolvida += q
    devolvidoValor += Number(it.total_item || 0)
    if ((d?.tipo_credito ?? '') !== 'sem_reembolso') devolvidoRev += Number(it.total_item || 0)
    if ((it.status_produto ?? 'ok') === 'ok') custoDevolvido += (custoCad.get(it.produto_id) ?? 0) * q
  }

  const dif = Math.round((vendaBruta - totalPago) * 100) / 100
  console.log(`\n${loja.nome}`)
  console.log(`  ENTRADA de pagamentos das vendas ....... R$ ${brl(totalPago).padStart(12)}   (sendo fiado R$ ${brl(fiado)})`)
  console.log(`  SAÍDA de itens a preço de venda ........ R$ ${brl(vendaBruta).padStart(12)}   (${itens.reduce((t, i) => t + Number(i.quantidade || 0), 0)} peças)`)
  console.log(`     diferença ........................... R$ ${brl(dif).padStart(12)}   ${Math.abs(dif) < 1 ? '✔ fecha' : '← conferir'}`)
  console.log(`  SAÍDA de itens a CUSTO (o que a peça custou)  R$ ${brl(custoBruto).padStart(12)}`)
  console.log(`  devolvido no mês: ${qtdDevolvida} peça(s) · a preço R$ ${brl(devolvidoValor)} · a custo R$ ${brl(custoDevolvido)}`)

  geral.pago += totalPago; geral.fiado += fiado; geral.venda += vendaBruta; geral.custo += custoBruto
  geral.devolvido += qtdDevolvida; geral.devolvidoRev += devolvidoRev
}

console.log(`\nDUAS LOJAS`)
console.log(`  venda (saída de itens a preço) ......... R$ ${brl(geral.venda)}`)
console.log(`  pagamentos (entrada) ................... R$ ${brl(geral.pago)}   (fiado ${brl(geral.fiado)} = ${(geral.fiado / Math.max(1, geral.pago) * 100).toFixed(0)}%)`)
console.log(`  custo da peça vendida .................. R$ ${brl(geral.custo)}`)
console.log(`  devoluções a preço ..................... R$ ${brl(geral.devolvidoRev)}  (${geral.devolvido} peças)`)

console.log(`\n########## METADE 2 — ESTOQUE × DÍVIDA PARA FORNECEDOR ##########`)
let estoqueTotal = 0, dividaTotal = 0
for (const loja of lojas ?? []) {
  const { data: deps } = await s.from('depositos').select('id').eq('loja_id', loja.id)
  const depIds = (deps ?? []).map((d) => d.id)
  const linhas = depIds.length ? await tudo((f, t) => s.from('estoque').select('quantidade, deposito_id, produtos(preco_custo, ativo)').in('deposito_id', depIds).gt('quantidade', 0).order('id').range(f, t)) : []
  let custo = 0, pecas = 0
  for (const e of linhas) {
    const pr = Array.isArray(e.produtos) ? e.produtos[0] : e.produtos
    if (pr?.ativo === false) continue
    custo += Number(pr?.preco_custo ?? 0) * Number(e.quantidade ?? 0)
    pecas += Number(e.quantidade ?? 0)
  }
  const pend = await tudo((f, t) => s.from('lancamentos').select('valor, valor_pago, categoria, status').eq('tipo', 'pagar').neq('status', 'pago').neq('status', 'cancelado').eq('loja_id', loja.id).order('id').range(f, t))
  const divida = pend.filter((l) => MERC.test(l.categoria ?? '')).reduce((t, l) => t + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0)
  const outras = pend.filter((l) => !MERC.test(l.categoria ?? '')).reduce((t, l) => t + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0)
  estoqueTotal += custo
  dividaTotal += divida
  console.log(`\n${loja.nome}`)
  console.log(`  ESTOQUE na prateleira (a custo) ........ R$ ${brl(custo).padStart(12)}   (${pecas} peças)`)
  console.log(`  DÍVIDA com fornecedor (mercadoria aberta) R$ ${brl(divida).padStart(12)}`)
  console.log(`  outras contas em aberto ................ R$ ${brl(outras).padStart(12)}`)
}
console.log(`\nDUAS LOJAS`)
console.log(`  estoque a custo ........................ R$ ${brl(estoqueTotal)}`)
console.log(`  dívida de mercadoria em aberto ......... R$ ${brl(dividaTotal)}`)
console.log(`  → o fornecedor financia ${(dividaTotal / Math.max(1, estoqueTotal) * 100).toFixed(0)}% do que está na prateleira.`)
