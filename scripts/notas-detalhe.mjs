// READ-ONLY: detalhe das notas H2O/ADL (para conferir com o pedido) + faixa do resultado de outubro.
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
const L = []
const out = (t = '') => { L.push(t); console.log(t) }
const de = '2026-10-01T00:00:00-03:00', ate = '2026-11-01T00:00:00-03:00'

// ── notas H2O e ADL com itens ───────────────────────────────────────────
const notas = await pagina('notas_entrada', 'id, numero, fornecedor_id, valor_total, data_entrada', (q) => q.gte('data_entrada', '2026-10-01').lt('data_entrada', '2026-11-01'))
const fornecedores = [...new Set(notas.map((n) => n.fornecedor_id).filter(Boolean))]
const nomePessoa = new Map()
for (let i = 0; i < fornecedores.length; i += 200) {
  const { data } = await s.from('pessoas').select('id, nome').in('id', fornecedores.slice(i, i + 200))
  for (const p of data ?? []) nomePessoa.set(p.id, p.nome)
}
const itens = await pagina('itens_nota_entrada', 'nota_id, quantidade, preco_unitario, total_item, produto_id, produtos(id, nome)')
const produtos = await pagina('produtos', 'id, nome, preco_custo, preco')
const prodDe = new Map(produtos.map((p) => [p.id, p]))
const itensDe = new Map()
for (const it of itens) {
  if (!itensDe.has(it.nota_id)) itensDe.set(it.nota_id, [])
  itensDe.get(it.nota_id).push(it)
}

out('# Notas de H2O e ADL de outubro — para conferir com o pedido do fornecedor')
out()
for (const alvo of ['H2O', 'ADL']) {
  const lista = notas.filter((n) => new RegExp(alvo === 'H2O' ? 'H2|H²O' : 'ADL', 'i').test(nomePessoa.get(n.fornecedor_id) ?? ''))
    .sort((a, b) => Number(b.valor_total) - Number(a.valor_total))
  out(`## ${alvo} — ${lista.length} notas · ${brl(lista.reduce((t, n) => t + Number(n.valor_total ?? 0), 0))}`)
  out()
  for (const n of lista.slice(0, 6)) {
    const its = itensDe.get(n.id) ?? []
    const un = its.reduce((t, i) => t + Number(i.quantidade ?? 0), 0)
    out(`### Nota ${n.numero ?? '—'} · ${n.data_entrada.split('-').reverse().join('/')} · **${brl(n.valor_total)}** · ${its.length} itens · ${un} unidades`)
    out()
    out('| Produto | Qtd | Unitário | Total | Custo cadastrado |')
    out('|---|---|---|---|---|')
    for (const i of its) {
      const p = i.produtos?.nome ?? '(produto sem nome)'
      const cad = prodDe.get(i.produto_id)
      out(`| ${String(p).slice(0, 44)} | ${i.quantidade} | ${brl(i.preco_unitario)} | ${brl(i.total_item)} | ${brl(cad?.preco_custo ?? 0)} |`)
    }
    out()
  }
}

// ── faixa do resultado do mês ───────────────────────────────────────────
out('## Faixa do resultado de outubro (estimativa, não é fechamento)')
out()
const vendas = await pagina('vendas', 'total', (q) => q.eq('status', 'concluida').eq('uso_interno', false).gte('data', de).lt('data', ate))
const faturamento = vendas.reduce((t, v) => t + Number(v.total ?? 0), 0)
const devol = await pagina('devolucoes', 'valor_total', (q) => q.gte('created_at', de).lt('created_at', ate))
const devolvido = devol.reduce((t, d) => t + Number(d.valor_total ?? 0), 0)
const desp = await pagina('lancamentos', 'valor, categoria', (q) => q.eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', de).lt('data_pagamento', ate))
const porCategoria = {}
for (const d of desp) porCategoria[d.categoria ?? '(sem)'] = (porCategoria[d.categoria ?? '(sem)'] ?? 0) + Number(d.valor ?? 0)
const naoDinheiro = (porCategoria['Vale crédito usado'] ?? 0) + (porCategoria['Uso interno'] ?? 0)
const mercadoria = (porCategoria['Fornecedor / Mercadoria'] ?? 0) + (porCategoria['Mercadoria'] ?? 0)
const despesas = desp.reduce((t, d) => t + Number(d.valor ?? 0), 0) - naoDinheiro - mercadoria
const estoqueInicial = 455129.14
const estoqueFinal = 459594.41
const comprasApp = 290437.18
const comprasPapel = 200999.36

out('| | Cenário A (nota do app) | Cenário B (papel) |')
out('|---|---|---|')
out(`| Faturamento bruto | ${brl(faturamento)} | ${brl(faturamento)} |`)
out(`| (−) devoluções do mês | ${brl(-devolvido)} | ${brl(-devolvido)} |`)
out(`| **= venda líquida** | **${brl(faturamento - devolvido)}** | **${brl(faturamento - devolvido)}** |`)
const cmvA = estoqueInicial + comprasApp - estoqueFinal
const cmvB = estoqueInicial + comprasPapel - estoqueFinal
out(`| (−) mercadoria consumida | ${brl(-cmvA)} | ${brl(-cmvB)} |`)
out(`| (−) despesas (sem mercadoria, sem vale, sem uso interno) | ${brl(-despesas)} | ${brl(-despesas)} |`)
const resA = faturamento - devolvido - cmvA - despesas
const resB = faturamento - devolvido - cmvB - despesas
out(`| **= resultado** | **${brl(resA)}** (${((resA / (faturamento - devolvido)) * 100).toFixed(1)}%) | **${brl(resB)}** (${((resB / (faturamento - devolvido)) * 100).toFixed(1)}%) |`)
out()
out(`Diferença entre os cenários: **${brl(resB - resA)}** — é exatamente o tamanho da dúvida das notas.`)
out()
out('### Como cheguei nas despesas')
out()
out(`Total pago no app em outubro: ${brl(desp.reduce((t, d) => t + Number(d.valor ?? 0), 0))}`)
out(`tirando mercadoria ${brl(mercadoria)}, vale-crédito usado ${brl(porCategoria['Vale crédito usado'] ?? 0)} e uso interno ${brl(porCategoria['Uso interno'] ?? 0)}`)
out(`→ despesas do mês: **${brl(despesas)}**`)
out()
out('Top categorias:')
out()
for (const [k, v] of Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 12)) out(`- ${brl(v).padStart(14)} ${k}`)

fs.writeFileSync('docs/fechamento/2026-10/notas-detalhe-e-resultado.md', L.join('\n') + '\n', 'utf8')
console.log('\nok: docs/fechamento/2026-10/notas-detalhe-e-resultado.md')
