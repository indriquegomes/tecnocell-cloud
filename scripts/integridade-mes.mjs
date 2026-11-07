// Integridade READ-ONLY de outubro/2026: fiado, vale-crédito, devoluções, caixa, estoque.
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

out('# Integridade de outubro/2026 (read-only)')
out()

// ── fiado ────────────────────────────────────────────────────────────────
out('## Fiado')
const fiado = await pagina('lancamentos', 'id, valor, valor_pago, status, venda_id, pessoa_id, loja_id, created_at, data_vencimento', (q) => q.eq('tipo', 'receber'))
const doMes = fiado.filter((l) => l.created_at >= de && l.created_at < ate)
out(`- notas de fiado criadas no mês: ${doMes.length} · ${brl(doMes.reduce((t, l) => t + Number(l.valor ?? 0), 0))}`)
const aberto = fiado.filter((l) => l.status === 'pendente')
out(`- em aberto hoje: ${aberto.length} · ${brl(aberto.reduce((t, l) => t + Number(l.valor ?? 0) - Number(l.valor_pago ?? 0), 0))}`)
out(`- em aberto SEM cliente (pessoa_id nulo): ${aberto.filter((l) => !l.pessoa_id).length} · ${brl(aberto.filter((l) => !l.pessoa_id).reduce((t, l) => t + Number(l.valor ?? 0) - Number(l.valor_pago ?? 0), 0))}`)
out(`- em aberto SEM venda ligada: ${aberto.filter((l) => !l.venda_id).length}`)
const pagoSemValor = fiado.filter((l) => l.status === 'pago' && !Number(l.valor_pago))
out(`- **marcadas PAGAS com valor_pago = 0: ${pagoSemValor.length} · ${brl(pagoSemValor.reduce((t, l) => t + Number(l.valor ?? 0), 0))}** (dívida sumiu sem registro de pagamento)`)
const pagoMaior = fiado.filter((l) => Number(l.valor_pago ?? 0) > Number(l.valor ?? 0) + 0.01)
out(`- pagas com valor_pago MAIOR que a dívida: ${pagoMaior.length}`)
const vencidas = aberto.filter((l) => l.data_vencimento && l.data_vencimento.slice(0, 10) < '2026-10-01')
out(`- vencidas antes de outubro: ${vencidas.length} · ${brl(vencidas.reduce((t, l) => t + Number(l.valor ?? 0) - Number(l.valor_pago ?? 0), 0))}`)
out()

// ── vale-crédito ─────────────────────────────────────────────────────────
out('## Vale-crédito')
const cr = await pagina('creditos_clientes', 'valor, tipo, pessoa_id, loja_id, created_at, descricao, estorna_credito_id')
const somaTipo = {}
for (const c of cr) { somaTipo[c.tipo] = (somaTipo[c.tipo] ?? 0) + Number(c.valor ?? 0) }
out(`- histórica: ${cr.length} linhas · ${Object.entries(somaTipo).map(([k, v]) => `${k} ${brl(v)}`).join(' · ')}`)
const saldo = (somaTipo.credito ?? 0) - (somaTipo.uso ?? 0) + (somaTipo.estorno ?? 0)
out(`- **saldo de vale hoje (crédito − uso ± estorno): ${brl(saldo)}**`)
const semPessoa = cr.filter((c) => !c.pessoa_id)
out(`- créditos sem cliente: ${semPessoa.length}`)
const doMesCr = cr.filter((c) => c.created_at >= de && c.created_at < ate)
out(`- no mês: +${brl(doMesCr.filter((c) => c.tipo === 'credito').reduce((t, c) => t + Number(c.valor ?? 0), 0))} de crédito · ${brl(doMesCr.filter((c) => c.tipo === 'uso').reduce((t, c) => t + Number(c.valor ?? 0), 0))} de uso`)
// saldo por cliente, achar negativo
const porCliente = {}
for (const c of cr) { const k = c.pessoa_id ?? '(sem)'; porCliente[k] = (porCliente[k] ?? 0) + (c.tipo === 'uso' ? -Number(c.valor ?? 0) : Number(c.valor ?? 0)) }
const clientesNeg = Object.entries(porCliente).filter(([, v]) => v < -0.01)
out(`- **clientes com saldo NEGATIVO: ${clientesNeg.length} · ${brl(clientesNeg.reduce((t, [, v]) => t + v, 0))}**`)
out()

// ── devoluções ───────────────────────────────────────────────────────────
out('## Devoluções (por que voltam)')
const dev = await pagina('devolucoes', 'valor_total, motivo_tipo, tipo_credito, created_at, itens_devolucao(quantidade, status_produto)', (q) => q.gte('created_at', de).lt('created_at', ate))
const porMotivo = {}
for (const d of dev) { const k = d.motivo_tipo ?? '(sem)'; porMotivo[k] ??= { n: 0, v: 0, un: 0 }; porMotivo[k].n++; porMotivo[k].v += Number(d.valor_total ?? 0); porMotivo[k].un += (d.itens_devolucao ?? []).reduce((t, i) => t + Number(i.quantidade ?? 0), 0) }
out('| Motivo (label em lib/motivos.ts) | Registros | Valor | Unidades |')
out('|---|---|---|---|')
const labels = { teste: 'Pediu pra testar', defeito_alegado: 'Defeito alegado', cliente_desistiu: 'Cliente dele desistiu', peca_errada: 'Peça errada / não serviu', outro: 'Outro' }
for (const [k, v] of Object.entries(porMotivo).sort((a, b) => b[1].v - a[1].v)) out(`| ${labels[k] ?? k} | ${v.n} | ${brl(v.v)} | ${v.un} |`)
const vendas = await pagina('vendas', 'id, total, status', (q) => q.eq('status', 'concluida').eq('uso_interno', false).gte('data', de).lt('data', ate))
const totalVendas = vendas.reduce((t, v) => t + Number(v.total ?? 0), 0)
const totalDev = dev.reduce((t, d) => t + Number(d.valor_total ?? 0), 0)
out(`\n- devolvido ${brl(totalDev)} = **${((totalDev / totalVendas) * 100).toFixed(1)}%** do vendido (${brl(totalVendas)})`)
out()

// ── caixa ────────────────────────────────────────────────────────────────
out('## Caixa por sessão (fechamento declarado × esperado)')
const cxs = await pagina('caixas', 'id, loja_id, aberto_em, fechado_em, valor_abertura, valor_fechamento, status, obs_fechamento')
const cxsMes = cxs.filter((c) => c.aberto_em >= de && c.aberto_em < ate)
const movs = await pagina('movimentos_caixa', 'tipo, forma_pagamento, valor, caixa_id, created_at', (q) => q.gte('created_at', de).lt('created_at', ate), 'created_at')
const pagsTodas = []
for (let i = 0; i < vendas.length; i += 150) {
  const lote = vendas.slice(i, i + 150).map((v) => v.id)
  pagsTodas.push(...await pagina('pagamentos_venda', 'venda_id, valor, forma_pagamento_id, status', (q) => q.in('venda_id', lote)))
}
const formaDin = new Set((await s.from('formas_pagamento').select('id, tipo').eq('tipo', 'dinheiro')).data?.map((f) => f.id) ?? [])
const vendaDe = new Map(vendas.map((v) => [v.id, v]))
out(`- sessões: ${cxsMes.length} · fechadas ${cxsMes.filter((c) => c.status !== 'aberto').length} · abertas ${cxsMes.filter((c) => c.status === 'aberto').length}`)
let pior = { dif: 0 }
for (const c of cxsMes) {
  if (c.status === 'aberto') continue
  const vdin = pagsTodas.filter((p) => p.status === 'pago' && formaDin.has(p.forma_pagamento_id) && p.venda_id && (vendaDe.get(p.venda_id)?.total ?? null) !== undefined).length ? 0 : 0
  const mv = movs.filter((m) => m.caixa_id === c.id && (m.forma_pagamento ?? '').toLowerCase().includes('dinheiro'))
  const fluxo = (mv.filter((m) => m.tipo === 'recebimento' || m.tipo === 'reforco').reduce((t, m) => t + Number(m.valor ?? 0), 0)) - (mv.filter((m) => m.tipo === 'retirada' || m.tipo === 'devolucao').reduce((t, m) => t + Number(m.valor ?? 0), 0))
  const dif = Number(c.valor_fechamento ?? 0) - Number(c.valor_abertura ?? 0) - fluxo
  if (Math.abs(dif) > Math.abs(pior.dif)) pior = { dif, id: c.id, dia: c.aberto_em.slice(0, 10) }
}
out(`- maior diferença numa sessão (fechamento − abertura − movimentos de dinheiro): ${brl(pior.dif)} em ${pior.dia ?? '—'}`)
out()

// ── estoque ──────────────────────────────────────────────────────────────
out('## Estoque e movimentos')
const estoque = await pagina('estoque', 'produto_id, deposito_id, quantidade')
const negativos = estoque.filter((e) => Number(e.quantidade) < 0)
out(`- linhas negativas: ${negativos.length} (${negativos.reduce((t, e) => t + Number(e.quantidade), 0)} un)`)
const movMes = await pagina('movimentacoes_estoque', 'operacao, quantidade, produto_id, deposito_id, created_at', (q) => q.gte('created_at', de).lt('created_at', ate), 'created_at')
const porOp = {}
for (const m of movMes) { porOp[m.operacao] = (porOp[m.operacao] ?? 0) + Number(m.quantidade ?? 0) }
out(`- movimentos do mês por operação (unidades): ${Object.entries(porOp).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
out()

fs.writeFileSync('docs/registros/2026-10/integridade.md', L.join('\n') + '\n', 'utf8')
console.log('\nok: docs/registros/2026-10/integridade.md')
