// SÓ LEITURA — SIMULAÇÃO: "e se eu fechasse o mês hoje?"
//
// Roda o DRE de um período fechado arbitrariamente (de/até) com a mesma régua do app:
// venda bruta − devoluções que devolveram dinheiro/crédito = receita líquida;
// custo bruto − custo das peças que voltaram ao estoque = custo líquido;
// menos as despesas com vencimento dentro do período.
//
// Também mostra o que ficaria FORA se fechar hoje (contas com vencimento depois do corte),
// porque fechar antes do dia 30 joga esses vencimentos para o mês seguinte.
//
// Uso: node scripts/simular-fechamento.mjs 2026-11-01 2026-11-24
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

const de = process.argv[2] ?? '2026-11-01'
const corteInclusivo = process.argv[3] ?? '2026-11-24'          // último dia que entra
const proximo = new Date(corteInclusivo + 'T12:00:00')
proximo.setDate(proximo.getDate() + 1)
const ateExclusivo = proximo.toISOString().slice(0, 10)
const inicio = de + 'T00:00:00-03:00'
const fim = ateExclusivo + 'T00:00:00-03:00'
const MERC = /mercadoria|fornecedor\s*\/?\s*mercadoria|fonecedor/i

const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')
const tot = { receitaBruta: 0, devolucao: 0, receitaLiquida: 0, custoBruto: 0, custoDev: 0, custoLiquido: 0, lucroBruto: 0, despesas: 0, despesasPend: 0, resultado: 0 }

for (const loja of lojas ?? []) {
  const { data: cxs } = await s.from('caixas').select('id').eq('loja_id', loja.id)
  const caixas = (cxs ?? []).map((c) => c.id)
  const { data: deps } = await s.from('depositos').select('id').eq('loja_id', loja.id)
  const depIds = (deps ?? []).map((d) => d.id)

  const vendas = await tudo((f, t) => s.from('vendas').select('id, total, caixa_id, created_at').eq('status', 'concluida').eq('uso_interno', false)
    .gte('created_at', inicio).lt('created_at', fim).order('id').range(f, t))
  const vs = vendas.filter((v) => v.caixa_id && caixas.includes(v.caixa_id))
  const ids = vs.map((v) => v.id)
  const receitaBruta = vs.reduce((t, v) => t + Number(v.total ?? 0), 0)
  const dias = new Set(vs.map((v) => (v.created_at ?? '').slice(0, 10)))

  const itens = ids.length ? await tudoIn(ids, (c, a, b) => s.from('itens_venda').select('venda_id, produto_id, quantidade, custo_unitario, produtos(preco_custo)').in('venda_id', c).order('id').range(a, b)) : []
  let custoBruto = 0
  const custoTravado = new Map()
  for (const it of itens) {
    const pr = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos
    const cu = it.custo_unitario != null ? Number(it.custo_unitario) : Number(pr?.preco_custo ?? 0)
    custoBruto += cu * Number(it.quantidade || 0)
    custoTravado.set(`${it.venda_id}|${it.produto_id}`, cu)
  }

  const devs = await tudo((f, t) => s.from('devolucoes').select('id, venda_id, tipo_credito').gte('created_at', inicio).lt('created_at', fim).in('deposito_id', depIds).order('id').range(f, t))
  const devInfo = new Map(devs.map((d) => [d.id, d]))
  const dItens = devs.length ? await tudoIn(devs.map((d) => d.id), (c, a, b) => s.from('itens_devolucao').select('devolucao_id, produto_id, quantidade, total_item, status_produto').in('devolucao_id', c).order('id').range(a, b)) : []
  const pids = [...new Set(dItens.map((i) => i.produto_id).filter(Boolean))]
  const prods = pids.length ? await tudoIn(pids, (c, a, b) => s.from('produtos').select('id, preco_custo').in('id', c).order('id').range(a, b)) : []
  const custoCad = new Map(prods.map((p) => [p.id, Number(p.preco_custo ?? 0)]))
  let devolucao = 0, custoDev = 0, pecasDev = 0
  for (const it of dItens) {
    const d = devInfo.get(it.devolucao_id)
    const q = Number(it.quantidade || 0)
    pecasDev += q
    if ((d?.tipo_credito ?? '') !== 'sem_reembolso') devolucao += Number(it.total_item || 0)
    if ((it.status_produto ?? 'ok') === 'ok') custoDev += (custoTravado.get(`${d?.venda_id}|${it.produto_id}`) ?? custoCad.get(it.produto_id) ?? 0) * q
  }

  const desp = await tudo((f, t) => s.from('lancamentos').select('valor, valor_pago, status, categoria').eq('tipo', 'pagar').neq('status', 'cancelado')
    .gte('data_vencimento', de).lt('data_vencimento', ateExclusivo).eq('loja_id', loja.id).order('id').range(f, t))
  let despesas = 0, despesasPend = 0
  for (const l of desp) {
    if (MERC.test(l.categoria ?? '')) continue
    const v = Number(l.valor ?? 0)
    despesas += v
    if (l.status !== 'pago') despesasPend += Math.max(0, v - Number(l.valor_pago ?? 0))
  }

  const receitaLiquida = receitaBruta - devolucao
  const custoLiquido = custoBruto - custoDev
  const lucroBruto = receitaLiquida - custoLiquido
  const resultado = lucroBruto - despesas

  console.log(`\n${loja.nome}`)
  console.log(`  venda bruta ................ R$ ${brl(receitaBruta).padStart(12)}   (${dias.size} dia(s) com venda)`)
  console.log(`  (−) devoluções ............. -R$ ${brl(devolucao).padStart(11)}   (${pecasDev} peças voltaram)`)
  console.log(`  receita líquida ............ R$ ${brl(receitaLiquida).padStart(12)}`)
  console.log(`  (−) custo bruto ............ -R$ ${brl(custoBruto).padStart(11)}`)
  console.log(`  (+) custo devolvido ........ R$ ${brl(custoDev).padStart(12)}`)
  console.log(`  custo líquido .............. -R$ ${brl(custoLiquido).padStart(11)}`)
  console.log(`  lucro bruto ................ R$ ${brl(lucroBruto).padStart(12)}`)
  console.log(`  (−) despesas (vencem até o corte) -R$ ${brl(despesas).padStart(11)}   (a pagar: R$ ${brl(despesasPend)})`)
  console.log(`  RESULTADO .................. R$ ${brl(resultado).padStart(12)}`)

  tot.receitaBruta += receitaBruta; tot.devolucao += devolucao; tot.receitaLiquida += receitaLiquida
  tot.custoBruto += custoBruto; tot.custoDev += custoDev; tot.custoLiquido += custoLiquido
  tot.lucroBruto += lucroBruto; tot.despesas += despesas; tot.despesasPend += despesasPend; tot.resultado += resultado
}

// o que ficaria de fora (vencimento depois do corte, ainda no mês)
let fora = 0
for (const loja of lojas ?? []) {
  const desp = await tudo((f, t) => s.from('lancamentos').select('valor, categoria').eq('tipo', 'pagar').neq('status', 'cancelado')
    .gte('data_vencimento', ateExclusivo).lt('data_vencimento', '2026-12-01').eq('loja_id', loja.id).order('id').range(f, t))
  fora += desp.filter((l) => !MERC.test(l.categoria ?? '')).reduce((t, l) => t + Number(l.valor ?? 0), 0)
}

console.log(`\n################ SE FECHAR EM ${corteInclusivo} ################`)
console.log(`  venda bruta ............... R$ ${brl(tot.receitaBruta)}`)
console.log(`  (−) devoluções ............ R$ ${brl(tot.devolucao)}`)
console.log(`  receita líquida ........... R$ ${brl(tot.receitaLiquida)}`)
console.log(`  (−) custo líquido ......... R$ ${brl(tot.custoLiquido)}`)
console.log(`  lucro bruto ............... R$ ${brl(tot.lucroBruto)}`)
console.log(`  (−) despesas do período ... R$ ${brl(tot.despesas)}   (desse total, a pagar: R$ ${brl(tot.despesasPend)})`)
console.log(`  = RESULTADO ............... R$ ${brl(tot.resultado)}`)
console.log(`\n  ATENÇÃO: fechar hoje deixa FORA R$ ${brl(fora)} de contas com vencimento entre ${ateExclusivo} e 30/11 —`)
console.log(`  elas cairiam no mês seguinte. Se elas entrassem, o resultado seria R$ ${brl(tot.resultado - fora)}.`)
