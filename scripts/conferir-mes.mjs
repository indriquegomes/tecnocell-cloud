// Foto READ-ONLY dos números do app num mês, por loja — base do cruzamento
// com o que está fora do app (contagem de dinheiro, contagem de estoque,
// planilha de fornecedor, planilha de caixa mensal).
//
// Nada é gravado no banco. Só lê e escreve um JSON em docs/registros/<mes>/.
//
// Uso:  node scripts/conferir-mes.mjs 2026-10
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PAGINA = 1000
async function tudo(fazer) {
  const out = []
  for (let from = 0; from < 500000; from += PAGINA) {
    const { data, error } = await fazer(from, from + PAGINA - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGINA) break
  }
  return out
}

const mes = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
if (!/^\d{4}-\d{2}$/.test(mes)) { console.error('Mês inválido. Ex.: node scripts/conferir-mes.mjs 2026-10'); process.exit(1) }
const [ano, m] = mes.split('-').map(Number)
const de = mes + '-01'
const ate = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
// timestamptz corta o mês em São Paulo: sem o -03:00, venda das 22h cai no mês seguinte.
const deTs = de + 'T00:00:00-03:00'
const ateTs = ate + 'T00:00:00-03:00'

const r2 = (n) => Math.round((n || 0) * 100) / 100

const [{ data: lojas }, deps, cxs] = await Promise.all([
  s.from('lojas').select('id, nome').order('nome'),
  tudo((from, to) => s.from('depositos').select('id, nome, loja_id').range(from, to)),
  tudo((from, to) => s.from('caixas').select('id, loja_id').range(from, to)),
])
const lojasList = lojas ?? []
const lojaDeDeposito = new Map(deps.map((d) => [d.id, d.loja_id]))
const lojaDeCaixa = new Map(cxs.map((c) => [c.id, c.loja_id]))

const { data: formas } = await s.from('formas_pagamento').select('id, nome, tipo')
const formaDe = new Map((formas ?? []).map((f) => [f.id, f]))

// ── vendas pagas do mês (mesma régua do Fechamento do Mês) ──────────────────
// O embed pagamentos_venda→vendas não resolve no PostgREST deste banco, então
// buscamos as vendas do mês e depois as parcelas por lote de id.
const vendasMes = await tudo((from, to) => s.from('vendas')
  .select('id, deposito_id, numero, status, uso_interno')
  .eq('status', 'concluida').eq('uso_interno', false)
  .lt('numero', 100000).gte('data', deTs).lt('data', ateTs).order('id').range(from, to))
const vendaDe = new Map(vendasMes.map((v) => [v.id, v]))
const pags = []
for (let i = 0; i < vendasMes.length; i += 200) {
  const lote = vendasMes.slice(i, i + 200).map((v) => v.id)
  const linhas = await tudo((from, to) => s.from('pagamentos_venda')
    .select('valor, forma_pagamento_id, venda_id').eq('status', 'pago').in('venda_id', lote).range(from, to))
  pags.push(...linhas)
}

const movs = await tudo((from, to) => s.from('movimentos_caixa')
  .select('tipo, forma_pagamento, valor, caixa_id, created_at').gte('created_at', deTs).lt('created_at', ateTs).range(from, to))

const notasMes = await tudo((from, to) => s.from('notas_entrada')
  .select('id, data_entrada, fornecedor_id')
  .neq('status', 'cancelada')
  .gte('data_entrada', de).lt('data_entrada', ate).order('id').range(from, to))
const notaDe = new Map(notasMes.map((n) => [n.id, n]))
const fornIds = [...new Set(notasMes.map((n) => n.fornecedor_id).filter(Boolean))]
const nomeFornecedor = new Map()
for (let i = 0; i < fornIds.length; i += 200) {
  const { data, error } = await s.from('pessoas').select('id, nome').in('id', fornIds.slice(i, i + 200))
  if (error) throw new Error(error.message)
  for (const p of data ?? []) nomeFornecedor.set(p.id, p.nome)
}
const itensNota = []
for (let i = 0; i < notasMes.length; i += 200) {
  const lote = notasMes.slice(i, i + 200).map((n) => n.id)
  const linhas = await tudo((from, to) => s.from('itens_nota_entrada')
    .select('total_item, deposito_id, nota_id').in('nota_id', lote).range(from, to))
  itensNota.push(...linhas)
}

const contas = await tudo((from, to) => s.from('lancamentos')
  .select('valor, tipo, status, categoria, subcategoria, loja_id, pessoa_nome, forma_pagamento, data_pagamento, data_vencimento')
  .eq('tipo', 'pagar').eq('status', 'pago')
  .gte('data_pagamento', deTs).lt('data_pagamento', ateTs).range(from, to))

const aPagarAberto = await tudo((from, to) => s.from('lancamentos')
  .select('valor, valor_pago, categoria, loja_id, pessoa_nome, data_vencimento')
  .eq('tipo', 'pagar').eq('status', 'pendente').range(from, to))

const fiadoAberto = await tudo((from, to) => s.from('lancamentos')
  .select('valor, valor_pago, loja_id, pessoa_id').eq('tipo', 'receber').eq('status', 'pendente').range(from, to))

const estoque = await tudo((from, to) => s.from('estoque')
  .select('quantidade, deposito_id, produtos(nome, preco_custo, preco)').gt('quantidade', 0).range(from, to))

// ── agregação por loja ─────────────────────────────────────────────────────
const zero = () => ({ entradas: 0, dinheiroEntrou: 0, fiadoCobrado: 0, compras: 0, despesas: 0, despesasDinheiro: 0, porForma: {} })
const porLoja = {}
for (const l of lojasList) porLoja[l.id] = zero()
const add = (loja, campo, v) => { if (loja && porLoja[loja]) porLoja[loja][campo] += v }

for (const p of pags) {
  const venda = vendaDe.get(p.venda_id)
  const loja = lojaDeDeposito.get(venda?.deposito_id)
  if (!loja) continue
  add(loja, 'entradas', p.valor ?? 0)
  const f = formaDe.get(p.forma_pagamento_id)
  const nome = f?.nome ?? '(sem forma)'
  porLoja[loja].porForma[nome] = (porLoja[loja].porForma[nome] ?? 0) + (p.valor ?? 0)
  if (f?.tipo === 'dinheiro') add(loja, 'dinheiroEntrou', p.valor ?? 0)
}
const ehDinheiro = (t) => (t ?? '').trim().toLowerCase().includes('dinheiro')
for (const mv of movs) {
  const loja = lojaDeCaixa.get(mv.caixa_id)
  if (mv.tipo === 'recebimento') add(loja, 'fiadoCobrado', mv.valor ?? 0)
  if (ehDinheiro(mv.forma_pagamento)) {
    if (mv.tipo === 'recebimento' || mv.tipo === 'reforco') add(loja, 'dinheiroEntrou', mv.valor ?? 0)
    if (mv.tipo === 'retirada' || mv.tipo === 'devolucao') add(loja, 'dinheiroEntrou', -(mv.valor ?? 0))
  }
}
const comprasPorFornecedor = {}
for (const it of itensNota) {
  const nota = notaDe.get(it.nota_id)
  const loja = lojaDeDeposito.get(it.deposito_id) ?? lojaDeDeposito.get(nota?.deposito_id)
  add(loja, 'compras', it.total_item ?? 0)
  const forn = nomeFornecedor.get(nota?.fornecedor_id) ?? '(sem fornecedor)'
  const k = `${forn}`
  comprasPorFornecedor[k] = comprasPorFornecedor[k] ?? { total: 0, loja: {} }
  comprasPorFornecedor[k].total += it.total_item ?? 0
  if (loja) comprasPorFornecedor[k].loja[loja] = (comprasPorFornecedor[k].loja[loja] ?? 0) + (it.total_item ?? 0)
}
const despesasPorCategoria = {}
for (const c of contas) {
  add(c.loja_id, 'despesas', c.valor ?? 0)
  if (ehDinheiro(c.forma_pagamento)) add(c.loja_id, 'despesasDinheiro', c.valor ?? 0)
  const k = c.categoria ?? '(sem categoria)'
  despesasPorCategoria[k] = (despesasPorCategoria[k] ?? 0) + (c.valor ?? 0)
}

// caixas do mês (abertura/conferência de dinheiro)
const caixasMes = await tudo((from, to) => s.from('caixas')
  .select('id, loja_id, aberto_em, fechado_em, valor_abertura, valor_fechamento, status')
  .gte('aberto_em', deTs).lt('aberto_em', ateTs).order('aberto_em').range(from, to))

const estoquePorDeposito = {}
const estoquePorLoja = {}
for (const e of estoque) {
  const dep = deps.find((d) => d.id === e.deposito_id)
  const custo = Number(e.produtos?.preco_custo ?? 0) * Number(e.quantidade ?? 0)
  const venda = Number(e.produtos?.preco ?? 0) * Number(e.quantidade ?? 0)
  const nomeDep = dep?.nome ?? '(sem depósito)'
  estoquePorDeposito[nomeDep] = estoquePorDeposito[nomeDep] ?? { qtd: 0, custo: 0, venda: 0 }
  estoquePorDeposito[nomeDep].qtd += Number(e.quantidade ?? 0)
  estoquePorDeposito[nomeDep].custo += custo
  estoquePorDeposito[nomeDep].venda += venda
  const loja = dep?.loja_id ?? null
  estoquePorLoja[loja ?? 'sem-loja'] = estoquePorLoja[loja ?? 'sem-loja'] ?? { qtd: 0, custo: 0, venda: 0 }
  estoquePorLoja[loja ?? 'sem-loja'].qtd += Number(e.quantidade ?? 0)
  estoquePorLoja[loja ?? 'sem-loja'].custo += custo
  estoquePorLoja[loja ?? 'sem-loja'].venda += venda
}

const nomeLoja = (id) => lojasList.find((l) => l.id === id)?.nome ?? (id ?? '(sem loja)')

const saida = {
  mes,
  gerado_em: new Date().toISOString(),
  janela: { de, ate },
  por_loja: Object.fromEntries(Object.entries(porLoja).map(([id, v]) => [nomeLoja(id), {
    ...v,
    porForma: Object.fromEntries(Object.entries(v.porForma).map(([k, x]) => [k, r2(x)])),
    entradas: r2(v.entradas), dinheiroEntrou: r2(v.dinheiroEntrou), fiadoCobrado: r2(v.fiadoCobrado),
    compras: r2(v.compras), despesas: r2(v.despesas), despesasDinheiro: r2(v.despesasDinheiro),
    resultado: r2(v.entradas + v.fiadoCobrado - v.compras - v.despesas),
    dinheiroEmMaos: r2(v.dinheiroEntrou - v.despesasDinheiro),
  }])),
  caixas: caixasMes.map((c) => ({
    loja: nomeLoja(c.loja_id), aberto_em: c.aberto_em, fechado_em: c.fechado_em,
    status: c.status, abertura: c.valor_abertura, fechamento: c.valor_fechamento,
  })),
  compras_por_fornecedor: Object.fromEntries(Object.entries(comprasPorFornecedor)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => [k, { total: r2(v.total), por_loja: Object.fromEntries(Object.entries(v.loja).map(([l, x]) => [nomeLoja(l), r2(x)])) }])),
  despesas_por_categoria: Object.fromEntries(Object.entries(despesasPorCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r2(v)])),
  contas_a_pagar_aberto: {
    total: r2(aPagarAberto.reduce((t, l) => t + ((l.valor ?? 0) - (l.valor_pago ?? 0)), 0)),
    notas: aPagarAberto.length,
  },
  fiado_aberto: {
    total: r2(fiadoAberto.reduce((t, l) => t + ((l.valor ?? 0) - (l.valor_pago ?? 0)), 0)),
    notas: fiadoAberto.length,
    por_loja: Object.fromEntries(lojasList.map((l) => [l.nome, r2(fiadoAberto.filter((x) => x.loja_id === l.id).reduce((t, x) => t + ((x.valor ?? 0) - (x.valor_pago ?? 0)), 0))])),
  },
  estoque: {
    por_deposito: Object.fromEntries(Object.entries(estoquePorDeposito).map(([k, v]) => [k, { qtd: v.qtd, custo: r2(v.custo), venda: r2(v.venda) }])),
    por_loja: Object.fromEntries(Object.entries(estoquePorLoja).map(([k, v]) => [nomeLoja(k), { qtd: v.qtd, custo: r2(v.custo), venda: r2(v.venda) }])),
  },
}

const dir = path.join('docs', 'fechamento', mes)
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, 'app.json')
fs.writeFileSync(arquivo, JSON.stringify(saida, null, 2), 'utf8')

const brl = (n) => 'R$ ' + (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
console.log(`\nFoto do app — ${mes} (read-only)\n`)
for (const [nome, v] of Object.entries(saida.por_loja)) {
  console.log(`${nome}`)
  console.log(`  entradas ${brl(v.entradas)} · fiado cobrado ${brl(v.fiadoCobrado)}`)
  console.log(`  compras  ${brl(v.compras)} · despesas ${brl(v.despesas)}`)
  console.log(`  resultado ${brl(v.resultado)} · dinheiro em mãos ${brl(v.dinheiroEmMaos)}`)
}
console.log(`\ncaixas de ${mes}: ${saida.caixas.length}`)
console.log(`a pagar em aberto: ${brl(saida.contas_a_pagar_aberto.total)} (${saida.contas_a_pagar_aberto.notas} notas)`)
console.log(`fiado em aberto:   ${brl(saida.fiado_aberto.total)} (${saida.fiado_aberto.notas} notas)`)
for (const [k, v] of Object.entries(saida.estoque.por_loja)) console.log(`estoque ${k}: ${v.qtd} un · custo ${brl(v.custo)} · venda ${brl(v.venda)}`)
console.log(`\nSalvo em ${arquivo}\n`)
