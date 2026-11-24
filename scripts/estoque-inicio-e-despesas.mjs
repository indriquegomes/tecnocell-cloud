// SÓ LEITURA — responde duas perguntas do dono (23/11):
//   1) As "despesas" do DRE são o que já foi gasto ou o que ainda falta pagar?
//   2) O estoque de R$ 490 mil: com quanto começou o mês? Cresceu ou diminuiu?
//      (crescimento = dinheiro que virou peça; queda = peça virou venda)
// Uso: node scripts/estoque-inicio-e-despesas.mjs 2026-11
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
let totalInicial = 0, totalAtual = 0

for (const loja of lojas ?? []) {
  console.log(`\n################ ${loja.nome} ################`)

  // ── 1) despesas do mês: pago x ainda a pagar
  const despesas = await tudo((f, t) => s.from('lancamentos').select('valor, valor_pago, status, categoria, data_pagamento')
    .eq('tipo', 'pagar').neq('status', 'cancelado').gte('data_vencimento', inicio).lt('data_vencimento', fim)
    .eq('loja_id', loja.id).order('id').range(f, t))
  const naoMerc = despesas.filter((l) => !MERC.test(l.categoria ?? ''))
  const pago = naoMerc.filter((l) => l.status === 'pago').reduce((t, l) => t + Number(l.valor_pago ?? l.valor ?? 0), 0)
  const pendente = naoMerc.filter((l) => l.status !== 'pago').reduce((t, l) => t + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0)
  const mercPend = despesas.filter((l) => MERC.test(l.categoria ?? '') && l.status !== 'pago').reduce((t, l) => t + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0)
  console.log(`\n1) DESPESAS que VENCERAM em ${mes} (sem mercadoria)`)
  console.log(`   já pagas ................. R$ ${brl(pago).padStart(12)}`)
  console.log(`   ainda a pagar ............ R$ ${brl(pendente).padStart(12)}`)
  console.log(`   total do mês ............. R$ ${brl(pago + pendente).padStart(12)}   ← é esse número que o DRE usa`)
  if (mercPend > 0) console.log(`   (+ mercadoria de fornecedor em aberto: R$ ${brl(mercPend)} — é estoque, não despesa)`)

  // ── 2) estoque: quanto tem hoje e com quanto começou o mês
  const { data: deps } = await s.from('depositos').select('id').eq('loja_id', loja.id)
  const depIds = (deps ?? []).map((d) => d.id)
  const linhas = depIds.length ? await tudo((f, t) => s.from('estoque').select('produto_id, quantidade, deposito_id, produtos(preco_custo, ativo)').in('deposito_id', depIds).gt('quantidade', 0).order('id').range(f, t)) : []
  let atual = 0, pecasAtual = 0
  const custoDe = new Map()
  for (const e of linhas) {
    const pr = Array.isArray(e.produtos) ? e.produtos[0] : e.produtos
    if (pr?.ativo === false) continue
    const custo = Number(pr?.preco_custo ?? 0)
    custoDe.set(e.produto_id, custo)
    atual += custo * Number(e.quantidade ?? 0)
    pecasAtual += Number(e.quantidade ?? 0)
  }

  // movimentos do mês (o que entrou e saiu de peça, a custo)
  const movs = depIds.length ? await tudo((f, t) => s.from('movimentacoes_estoque')
    .select('produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova').in('deposito_id', depIds)
    .gte('created_at', inicio).lt('created_at', fim).order('id').range(f, t)) : []
  const faltaCusto = [...new Set(movs.map((mv) => mv.produto_id))].filter((pid) => !custoDe.has(pid))
  if (faltaCusto.length) {
    const extra = await tudoIn(faltaCusto, (c, a, b) => s.from('produtos').select('id, preco_custo').in('id', c).order('id').range(a, b))
    for (const p of extra) custoDe.set(p.id, Number(p.preco_custo ?? 0))
  }
  const delta = { entrada: 0, saida: 0, perda: 0, uso_interno: 0, troca: 0, ajuste: 0 }
  const qtd = { entrada: 0, saida: 0, perda: 0, uso_interno: 0, troca: 0, ajuste: 0 }
  for (const mv of movs) {
    const op = mv.operacao
    const q = Number(mv.quantidade ?? 0)
    const custo = custoDe.get(mv.produto_id) ?? 0
    let sinal = 0
    if (op === 'entrada') sinal = 1
    else if (['saida', 'perda', 'uso_interno', 'troca'].includes(op)) sinal = -1
    else if (op === 'ajuste') { delta.ajuste += (Number(mv.qtd_nova ?? 0) - Number(mv.qtd_anterior ?? 0)) * custo; qtd.ajuste += Number(mv.qtd_nova ?? 0) - Number(mv.qtd_anterior ?? 0); continue }
    else continue
    delta[op] += sinal * q * custo
    qtd[op] += sinal * q
  }
  const variacao = Object.values(delta).reduce((a, b) => a + b, 0)
  const inicial = atual - variacao
  totalInicial += inicial; totalAtual += atual

  console.log(`\n2) ESTOQUE a custo`)
  console.log(`   hoje (fim do mês) ........ R$ ${brl(atual).padStart(12)}   (${pecasAtual} peças)`)
  console.log(`   começou o mês com ....... R$ ${brl(inicial).padStart(12)}`)
  console.log(`   variação no mês .......... R$ ${brl(variacao).padStart(12)}   ${variacao > 0 ? '(estocou mais do que vendeu)' : '(vendeu mais do que repôs)'}`)
  console.log(`   de onde veio a variação:`)
  console.log(`     entradas (notas) ...... + R$ ${brl(delta.entrada)}   (${qtd.entrada} peças)`)
  console.log(`     saídas (venda) ........ − R$ ${brl(-delta.saida)}   (${-qtd.saida} peças)`)
  console.log(`     perdas ................ − R$ ${brl(-delta.perda)}   (${-qtd.perda} peças)`)
  console.log(`     uso interno ........... − R$ ${brl(-delta.uso_interno)}   (${-qtd.uso_interno} peças)`)
  console.log(`     trocas (débito fornecedor) − R$ ${brl(-delta.troca)}   (${-qtd.troca} peças)`)
  console.log(`     ajustes de contagem ... ${delta.ajuste >= 0 ? '+' : '−'} R$ ${brl(Math.abs(delta.ajuste))}   (${qtd.ajuste} peças)`)
}

console.log(`\n################ AS DUAS LOJAS ################`)
console.log(`  estoque no começo do mês ... R$ ${brl(totalInicial)}`)
console.log(`  estoque hoje ............... R$ ${brl(totalAtual)}`)
console.log(`  variação ................... R$ ${brl(totalAtual - totalInicial)}   ${totalAtual - totalInicial > 0 ? '(cresceu: comprou mais do que vendeu)' : '(caiu: vendeu mais do que repôs)'}`)
