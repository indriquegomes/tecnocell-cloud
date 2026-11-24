// SÓ LEITURA — os números do DRE por loja, calculados fora da tela, para conferência
// antes de fechar o mês. Mesma régua do app (docs/mapa/regra-perda-e-devolucao.md).
// Uso: node scripts/dre-por-loja.mjs 2026-11
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

// mercadoria não é despesa (mesma régua do app)
const MERC = /mercadoria|fornecedor\s*\/?\s*mercadoria|fonecedor/i

const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')
for (const loja of lojas ?? []) {
  const { data: cxs } = await s.from('caixas').select('id').eq('loja_id', loja.id)
  const caixas = (cxs ?? []).map((c) => c.id)
  const { data: deps } = await s.from('depositos').select('id').eq('loja_id', loja.id)
  const depsIds = (deps ?? []).map((d) => d.id)

  // 1) receita bruta = vendas.total (concluída, não uso interno)
  const vendas = await tudo((f, t) => s.from('vendas').select('id, total, caixa_id').eq('status', 'concluida').eq('uso_interno', false)
    .gte('created_at', inicio).lt('created_at', fim).order('id').range(f, t))
  const vendasLoja = vendas.filter((v) => v.caixa_id && caixas.includes(v.caixa_id))
  const receitaBruta = vendasLoja.reduce((t, v) => t + Number(v.total ?? 0), 0)

  // 2) custo bruto (custo travado na venda) e mapa (venda|produto) → custo
  const itens = vendasLoja.length ? await tudoIn(vendasLoja.map((v) => v.id), (chunk, a, b) => s.from('itens_venda')
    .select('venda_id, produto_id, quantidade, custo_unitario, produtos(preco_custo)').in('venda_id', chunk).order('id').range(a, b)) : []
  let custoBruto = 0
  const custoTravado = new Map()
  for (const it of itens) {
    const prods = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos
    const cu = it.custo_unitario != null ? Number(it.custo_unitario) : Number(prods?.preco_custo ?? 0)
    custoBruto += cu * Number(it.quantidade || 0)
    custoTravado.set(`${it.venda_id}|${it.produto_id}`, cu)
  }

  // 3) devoluções da loja: receita devolvida e custo das peças que voltaram
  const devs = await tudo((f, t) => s.from('devolucoes').select('id, venda_id, tipo_credito').gte('created_at', inicio).lt('created_at', fim)
    .in('deposito_id', depsIds).order('id').range(f, t))
  const devInfo = new Map(devs.map((d) => [d.id, d]))
  const devItens = devs.length ? await tudoIn(devs.map((d) => d.id), (chunk, a, b) => s.from('itens_devolucao')
    .select('devolucao_id, produto_id, quantidade, total_item, status_produto').in('devolucao_id', chunk).order('id').range(a, b)) : []
  const pids = [...new Set(devItens.map((i) => i.produto_id).filter(Boolean))]
  const prods = pids.length ? await tudoIn(pids, (chunk, a, b) => s.from('produtos').select('id, preco_custo').in('id', chunk).order('id').range(a, b)) : []
  const custoCad = new Map(prods.map((p) => [p.id, Number(p.preco_custo ?? 0)]))
  let devolucaoReceita = 0, custoDevolvido = 0, pecas = 0
  for (const it of devItens) {
    const d = devInfo.get(it.devolucao_id)
    const qtd = Number(it.quantidade) || 0
    if ((d?.tipo_credito ?? '') !== 'sem_reembolso') devolucaoReceita += Number(it.total_item || 0)
    if ((it.status_produto ?? 'ok') === 'ok') custoDevolvido += (custoTravado.get(`${d?.venda_id}|${it.produto_id}`) ?? custoCad.get(it.produto_id) ?? 0) * qtd
    pecas += qtd
  }

  // 4) despesas do período (por vencimento, sem mercadoria)
  const lancs = await tudo((f, t) => s.from('lancamentos').select('valor, categoria, status').eq('tipo', 'pagar').neq('status', 'cancelado')
    .gte('data_vencimento', de).lt('data_vencimento', ate).eq('loja_id', loja.id).order('id').range(f, t))
  let despesas = 0, mercadoria = 0
  for (const l of lancs) {
    if (MERC.test(l.categoria ?? '')) { mercadoria += Number(l.valor ?? 0); continue }
    despesas += Number(l.valor ?? 0)
  }

  const receitaLiquida = receitaBruta - devolucaoReceita
  const cmvLiquido = custoBruto - custoDevolvido
  const lucroBruto = receitaLiquida - cmvLiquido
  console.log(`\n=== ${loja.nome} · ${mes} ===`)
  console.log(`  Receita de vendas (bruta)                       R$ ${brl(receitaBruta).padStart(12)}`)
  console.log(`  (−) Devoluções (sai da receita)                 -R$ ${brl(devolucaoReceita).padStart(11)}`)
  console.log(`  Receita de vendas (líquida)                     R$ ${brl(receitaLiquida).padStart(12)}`)
  console.log(`  (−) Custo das peças vendidas (bruto)            -R$ ${brl(custoBruto).padStart(11)}`)
  console.log(`  (+) Custo das peças devolvidas que voltaram     R$ ${brl(custoDevolvido).padStart(12)}   (${pecas} peça(s) devolvidas)`)
  console.log(`  (−) Custo das peças vendidas (líquido)          -R$ ${brl(cmvLiquido).padStart(11)}`)
  console.log(`  (=) Lucro bruto                                 R$ ${brl(lucroBruto).padStart(12)}`)
  console.log(`  (−) Despesas (contas a pagar, sem mercadoria)   -R$ ${brl(despesas).padStart(11)}`)
  console.log(`  (=) Resultado do período                        R$ ${brl(lucroBruto - despesas).padStart(12)}`)
  console.log(`  (fora do resultado: R$ ${brl(mercadoria)} de compra de mercadoria — é estoque)`)
}
