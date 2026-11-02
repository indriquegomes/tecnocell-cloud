// READ-ONLY: quebra de caixa por sessão + fiado quitado sem valor.
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
const L = []
const out = (t = '') => { L.push(t); console.log(t) }
out('# Quebra de caixa e fiado quitado sem valor — outubro/2026')
out()

const { data: lojas } = await s.from('lojas').select('id, nome')
const deps = await pagina('depositos', 'id, loja_id')
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))
const cxs = await pagina('caixas', 'id, loja_id, aberto_em, fechado_em, valor_abertura, valor_fechamento, status')
const vendas = await pagina('vendas', 'id, data, deposito_id, total, status, uso_interno', (q) => q.eq('status', 'concluida').eq('uso_interno', false).gte('data', de).lt('data', ate))
const vendaDe = new Map(vendas.map((v) => [v.id, { data: v.data, loja: lojaDep.get(v.deposito_id) }]))
const pags = []
for (let i = 0; i < vendas.length; i += 150) {
  const lote = vendas.slice(i, i + 150).map((v) => v.id)
  pags.push(...await pagina('pagamentos_venda', 'venda_id, valor, forma_pagamento_id, status', (q) => q.in('venda_id', lote)))
}
const formasDin = new Set((await s.from('formas_pagamento').select('id, tipo').eq('tipo', 'dinheiro')).data?.map((f) => f.id) ?? [])
const movs = await pagina('movimentos_caixa', 'tipo, forma_pagamento, valor, caixa_id, created_at', (q) => q.gte('created_at', de).lt('created_at', ate), 'created_at')

out('## Quebra de caixa por sessão')
out()
out('Cálculo: `fechamento − abertura − (venda em dinheiro na sessão + fiado recebido em dinheiro + reforço − retirada − devolução em dinheiro)`.')
out('Diferença positiva = sobrou dinheiro na gaveta; negativa = faltou.')
out()
out('| Data | Loja | Abertura | Fechamento | Esperado | Diferença |')
out('|---|---|---|---|---|---|')
let somaQuebra = 0
const quebras = []
for (const c of cxs.filter((x) => x.aberto_em >= de && x.aberto_em < ate && x.status !== 'aberto').sort((a, b) => a.aberto_em.localeCompare(b.aberto_em))) {
  const fim = c.fechado_em ?? new Date().toISOString()
  const vendaDin = pags.filter((p) => {
    if (p.status !== 'pago' || !formasDin.has(p.forma_pagamento_id)) return false
    const v = vendaDe.get(p.venda_id)
    return v && v.loja === c.loja_id && v.data >= c.aberto_em && v.data <= fim
  }).reduce((t, p) => t + Number(p.valor ?? 0), 0)
  const mv = movs.filter((m) => m.caixa_id === c.id && (m.forma_pagamento ?? '').toLowerCase().includes('dinheiro'))
  const entra = mv.filter((m) => m.tipo === 'recebimento' || m.tipo === 'reforco').reduce((t, m) => t + Number(m.valor ?? 0), 0)
  const sai = mv.filter((m) => m.tipo === 'retirada' || m.tipo === 'devolucao').reduce((t, m) => t + Number(m.valor ?? 0), 0)
  const esperado = Number(c.valor_abertura ?? 0) + vendaDin + entra - sai
  const dif = Number(c.valor_fechamento ?? 0) - esperado
  somaQuebra += dif
  quebras.push({ dia: c.aberto_em.slice(0, 10), loja: lojas.find((l) => l.id === c.loja_id)?.nome, ab: Number(c.valor_abertura ?? 0), fe: Number(c.valor_fechamento ?? 0), esperado, dif })
}
quebras.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))
for (const q of quebras.slice(0, 15)) out(`| ${q.dia} | ${q.loja} | ${brl(q.ab)} | ${brl(q.fe)} | ${brl(q.esperado)} | **${brl(q.dif)}** |`)
out()
const acima10 = quebras.filter((q) => Math.abs(q.dif) > 10)
const acima50 = quebras.filter((q) => Math.abs(q.dif) > 50)
out(`- sessões com diferença acima de R$ 10: **${acima10.length}** de ${quebras.length}`)
out(`- sessões com diferença acima de R$ 50: **${acima50.length}**`)
out(`- soma de todas as diferenças (quebra acumulada do mês): **${brl(somaQuebra)}**`)
out(`- soma das diferenças positivas (sobra): ${brl(quebras.filter((q) => q.dif > 0).reduce((t, q) => t + q.dif, 0))}`)
out(`- soma das diferenças negativas (falta): ${brl(quebras.filter((q) => q.dif < 0).reduce((t, q) => t + q.dif, 0))}`)
out()

out('## Fiado marcado PAGO sem valor de pagamento')
out()
const fiado = await pagina('lancamentos', 'id, valor, valor_pago, status, created_at, data_pagamento, pessoa_id, loja_id', (q) => q.eq('tipo', 'receber'))
const pago0 = fiado.filter((l) => l.status === 'pago' && !Number(l.valor_pago))
out(`- total no banco: **${pago0.length} notas · ${brl(pago0.reduce((t, l) => t + Number(l.valor ?? 0), 0))}**`)
const porAno = {}
for (const l of pago0) { const k = (l.data_pagamento ?? l.created_at).slice(0, 7); porAno[k] = (porAno[k] ?? 0) + 1 }
out(`- por mês da baixa: ${Object.entries(porAno).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}`)
const outMes = pago0.filter((l) => (l.data_pagamento ?? '') >= '2026-10-01' && (l.data_pagamento ?? '') < '2026-11-01')
out(`- baixadas EM OUTUBRO: **${outMes.length} · ${brl(outMes.reduce((t, l) => t + Number(l.valor ?? 0), 0))}**`)
out()
out('> Efeito: a dívida sai do fiado em aberto sem que nenhum pagamento apareça no caixa nem no relatório de recebimento.')
out('> Se essas baixas fossem reais, o dinheiro entrou em algum lugar (PIX, dinheiro, vale) e não foi registrado; se não foram reais, a dívida foi perdida.')

fs.writeFileSync('docs/fechamento/2026-10/quebra-e-fiado.md', L.join('\n') + '\n', 'utf8')
console.log('\nok: docs/fechamento/2026-10/quebra-e-fiado.md')
