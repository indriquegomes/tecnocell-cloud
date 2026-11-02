// Auditoria READ-ONLY de outubro/2026 no app — procura erro e falha nos dados.
// Não grava nada. Saída: docs/fechamento/2026-10/auditoria-app.md
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const P = 1000
async function tudo(q) { const o = []; for (let i = 0; i < 900000; i += P) { const { data, error } = await q(i, i + P - 1); if (error) throw new Error(error.message); o.push(...data); if (data.length < P) break } return o }

const deTs = '2026-10-01T00:00:00-03:00', ateTs = '2026-11-01T00:00:00-03:00'
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const L = []
const out = (t = '') => { L.push(t); console.log(t) }
const sec = (t) => { out(); out('## ' + t); out() }

const [{ data: lojas }, deps, cxs, formas] = await Promise.all([
  s.from('lojas').select('id, nome').order('nome'),
  tudo((a, b) => s.from('depositos').select('id, nome, loja_id').range(a, b)),
  tudo((a, b) => s.from('caixas').select('id, loja_id, aberto_em, fechado_em, valor_abertura, valor_fechamento, status, obs_fechamento').range(a, b)),
  s.from('formas_pagamento').select('id, nome, tipo').then((r) => r.data ?? []),
])
const nomeLoja = (id) => lojas.find((l) => l.id === id)?.nome ?? '(sem loja)'
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))
const lojaCx = new Map(cxs.map((c) => [c.id, c.loja_id]))
const formaDe = new Map(formas.map((f) => [f.id, f]))

// ── vendas ────────────────────────────────────────────────────────────────
const vendas = await tudo((a, b) => s.from('vendas').select('id, numero, total, status, uso_interno, data, deposito_id, pessoa_id').gte('data', deTs).lt('data', ateTs).order('id').range(a, b))
const pags = []
for (let i = 0; i < vendas.length; i += 200) {
  const lote = vendas.slice(i, i + 200).map((v) => v.id)
  pags.push(...await tudo((a, b) => s.from('pagamentos_venda').select('venda_id, valor, forma_pagamento_id, status').in('venda_id', lote).range(a, b)))
}
const somaPag = new Map()
for (const p of pags) somaPag.set(p.venda_id, (somaPag.get(p.venda_id) ?? 0) + Number(p.valor ?? 0))

sec('VENDAS DE OUTUBRO')
const concl = vendas.filter((v) => v.status === 'concluida' && !v.uso_interno && (v.numero ?? 0) < 100000)
out(`- vendas concluídas (fora uso interno): **${concl.length}** · total ${brl(concl.reduce((t, v) => t + Number(v.total ?? 0), 0))}`)
out(`- canceladas: ${vendas.filter((v) => v.status !== 'concluida').length} · uso_interno: ${vendas.filter((v) => v.uso_interno).length}`)
const semPag = concl.filter((v) => !somaPag.has(v.id))
out(`- **sem nenhuma linha de pagamento: ${semPag.length}**${semPag.length ? ' → ' + brl(semPag.reduce((t, v) => t + Number(v.total ?? 0), 0)) : ''}`)
const desvio = concl.filter((v) => somaPag.has(v.id) && Math.abs((somaPag.get(v.id) ?? 0) - Number(v.total ?? 0)) > 0.01)
out(`- soma de pagamentos ≠ total da venda: **${desvio.length}** · diferença somada ${brl(desvio.reduce((t, v) => t + Number(v.total ?? 0) - (somaPag.get(v.id) ?? 0), 0))}`)
for (const v of desvio.slice(0, 8)) out(`  - #${v.numero} total ${brl(v.total)} × pagamentos ${brl(somaPag.get(v.id))} (${nomeLoja(lojaDep.get(v.deposito_id))})`)
const altoNum = vendas.filter((v) => v.status === 'concluida' && !v.uso_interno && (v.numero ?? 0) >= 100000)
out(`- vendas concluídas com número ≥ 100000 (excluídas do Fechamento do Mês): **${altoNum.length}** · ${brl(altoNum.reduce((t, v) => t + Number(v.total ?? 0), 0))}`)
for (const v of altoNum.slice(0, 6)) out(`  - #${v.numero} ${brl(v.total)} ${v.data?.slice(0, 10)} (${nomeLoja(lojaDep.get(v.deposito_id))})`)
const stPag = {}
for (const p of pags) { stPag[p.status] = (stPag[p.status] ?? 0) + Number(p.valor ?? 0) }
out(`- por status do pagamento: ${Object.entries(stPag).map(([k, v]) => `${k} ${brl(v)}`).join(' · ')}`)
const porForma = {}
for (const p of pags.filter((p) => p.status === 'pago')) { const f = formaDe.get(p.forma_pagamento_id); const k = `${f?.nome ?? '?'} [${f?.tipo ?? '?'}]`; porForma[k] = (porForma[k] ?? 0) + Number(p.valor ?? 0) }
out('- entradas por forma (status pago):')
for (const [k, v] of Object.entries(porForma).sort((a, b) => b[1] - a[1])) out(`  - ${brl(v).padStart(14)} ${k}`)

// ── caixas ────────────────────────────────────────────────────────────────
sec('CAIXAS DE OUTUBRO')
const cxMes = cxs.filter((c) => c.aberto_em >= deTs && c.aberto_em < ateTs).sort((a, b) => a.aberto_em.localeCompare(b.aberto_em))
out(`- caixas abertos no mês: **${cxMes.length}** (fechados ${cxMes.filter((c) => c.status === 'fechado').length}, abertos ${cxMes.filter((c) => c.status !== 'fechado').length})`)
for (const c of cxMes.filter((c) => c.status !== 'fechado')) out(`  - ABERTO: ${nomeLoja(c.loja_id)} desde ${c.aberto_em.slice(0, 16)}`)
const fechSemValor = cxMes.filter((c) => c.status === 'fechado' && c.valor_fechamento == null)
out(`- fechados SEM valor de fechamento: ${fechSemValor.length}`)
const valores = cxMes.filter((c) => c.valor_fechamento != null).map((c) => Number(c.valor_fechamento))
out(`- fechamento: menor ${brl(Math.min(...valores))} · maior ${brl(Math.max(...valores))} · soma ${brl(valores.reduce((a, b) => a + b, 0))}`)

// ── notas de entrada ─────────────────────────────────────────────────────
sec('NOTAS DE ENTRADA DE OUTUBRO')
const notas = await tudo((a, b) => s.from('notas_entrada').select('id, numero, fornecedor_id, valor_total, data_entrada, status').gte('data_entrada', '2026-10-01').lt('data_entrada', '2026-11-01').order('id').range(a, b))
const itensNota = []
for (let i = 0; i < notas.length; i += 200) {
  const lote = notas.slice(i, i + 200).map((n) => n.id)
  itensNota.push(...await tudo((a, b) => s.from('itens_nota_entrada').select('nota_id, total_item, quantidade').in('nota_id', lote).range(a, b)))
}
const somaItens = new Map()
for (const it of itensNota) somaItens.set(it.nota_id, (somaItens.get(it.nota_id) ?? 0) + Number(it.total_item ?? 0))
out(`- notas: ${notas.length} · valor_total somado ${brl(notas.reduce((t, n) => t + Number(n.valor_total ?? 0), 0))}`)
out(`- notas SEM itens: ${notas.filter((n) => !somaItens.has(n.id)).length} · notas com valor_total 0: ${notas.filter((n) => !Number(n.valor_total)).length}`)
const divergNota = notas.filter((n) => somaItens.has(n.id) && Math.abs((somaItens.get(n.id) ?? 0) - Number(n.valor_total ?? 0)) > 0.01)
out(`- valor_total ≠ soma dos itens: ${divergNota.length}${divergNota.length ? ' (diferença ' + brl(divergNota.reduce((t, n) => t + (Number(n.valor_total ?? 0) - (somaItens.get(n.id) ?? 0)), 0)) + ')' : ''}`)
for (const n of divergNota.slice(0, 6)) out(`  - nota ${n.numero ?? n.id.slice(0, 8)} (${n.data_entrada}): total ${brl(n.valor_total)} × itens ${brl(somaItens.get(n.id))}`)
const chave = new Map()
for (const n of notas) { const k = `${n.fornecedor_id}|${n.numero}|${Number(n.valor_total).toFixed(2)}`; chave.set(k, [...(chave.get(k) ?? []), n]) }
const dups = [...chave.values()].filter((arr) => arr.length > 1)
out(`- **notas possivelmente duplicadas** (mesmo fornecedor+numero+valor): ${dups.length}`)
for (const arr of dups.slice(0, 6)) out(`  - ${arr.map((n) => n.data_entrada + ' ' + brl(n.valor_total)).join(' | ')}`)

// ── produtos / estoque ───────────────────────────────────────────────────
sec('PRODUTOS E ESTOQUE')
const produtos = await tudo((a, b) => s.from('produtos').select('id, nome, preco, preco_custo, ativo').range(a, b))
const estoque = await tudo((a, b) => s.from('estoque').select('produto_id, deposito_id, quantidade').range(a, b))
const prodDe = new Map(produtos.map((p) => [p.id, p]))
const comEstoque = estoque.filter((e) => Number(e.quantidade) > 0)
const custoZero = comEstoque.filter((e) => !Number(prodDe.get(e.produto_id)?.preco_custo))
out(`- produtos cadastrados: ${produtos.length} · linhas de estoque > 0: ${comEstoque.length}`)
out(`- **com estoque e custo ZERO: ${custoZero.length} linhas, ${custoZero.reduce((t, e) => t + Number(e.quantidade), 0)} unidades** — lucro do app fica inflado`)
const vendaMenorCusto = comEstoque.filter((e) => { const p = prodDe.get(e.produto_id); return p && Number(p.preco) > 0 && Number(p.preco_custo) > 0 && Number(p.preco) < Number(p.preco_custo) })
out(`- preço de venda MENOR que o custo: ${vendaMenorCusto.length} linhas`)
const negativos = estoque.filter((e) => Number(e.quantidade) < 0)
out(`- estoque NEGATIVO: ${negativos.length} linhas (${negativos.reduce((t, e) => t + Number(e.quantidade), 0)} unidades)`)

// ── perdas, devoluções, trocas ───────────────────────────────────────────
sec('PERDAS, DEVOLUÇÕES, TROCAS')
const perdas = await tudo((a, b) => s.from('movimentacoes_estoque').select('quantidade, observacao, deposito_id, produto_id').eq('operacao', 'perda').gte('created_at', deTs).lt('created_at', ateTs).range(a, b))
const custoPerda = perdas.reduce((t, p) => t + Number(prodDe.get(p.produto_id)?.preco_custo ?? 0) * Number(p.quantidade ?? 0), 0)
out(`- perdas em outubro: ${perdas.length} registros · custo ${brl(custoPerda)}`)
for (const pd of perdas.slice(0, 6)) out(`  - ${nomeLoja(lojaDep.get(pd.deposito_id))}: ${prodDe.get(pd.produto_id)?.nome?.slice(0, 30)} (${pd.quantidade}) — ${(pd.observacao || '—').slice(0, 40)}`)
const devol = await tudo((a, b) => s.from('devolucoes').select('id, valor_total, motivo_tipo, status, created_at').gte('created_at', deTs).lt('created_at', ateTs).range(a, b))
out(`- devoluções em outubro: ${devol.length} · total ${brl(devol.reduce((t, d) => t + Number(d.valor_total ?? 0), 0))}`)
const trocas = await tudo((a, b) => s.from('trocas_sp').select('valor, status, loja_id').range(a, b))
const troSt = {}
for (const t of trocas) { troSt[t.status] = (troSt[t.status] ?? 0) + Number(t.valor ?? 0) }
out(`- trocas SP por status: ${Object.entries(troSt).map(([k, v]) => `${k} ${brl(v)}`).join(' · ') || 'nenhuma'}`)

// ── fiado ────────────────────────────────────────────────────────────────
sec('FIADO')
const fiadoMes = await tudo((a, b) => s.from('lancamentos').select('valor, valor_pago, status, loja_id').eq('tipo', 'receber').gte('created_at', deTs).lt('created_at', ateTs).range(a, b))
out(`- notas criadas em outubro: ${fiadoMes.length} · ${brl(fiadoMes.reduce((t, l) => t + Number(l.valor ?? 0), 0))} · já pagas ${brl(fiadoMes.reduce((t, l) => t + Number(l.valor_pago ?? 0), 0))}`)
const fiadoAberto = await tudo((a, b) => s.from('lancamentos').select('valor, valor_pago, loja_id, pessoa_id').eq('tipo', 'receber').eq('status', 'pendente').range(a, b))
out(`- em aberto hoje: ${fiadoAberto.length} notas · ${brl(fiadoAberto.reduce((t, l) => t + (Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0))} · sem cliente ${fiadoAberto.filter((l) => !l.pessoa_id).length}`)

// ── despesas pagas: formas suspeitas ─────────────────────────────────────
sec('DESPESAS PAGAS EM OUTUBRO')
const desp = await tudo((a, b) => s.from('lancamentos').select('valor, categoria, forma_pagamento, data_pagamento, loja_id, pessoa_nome, descricao').eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', deTs).lt('data_pagamento', ateTs).range(a, b))
out(`- total pago: **${brl(desp.reduce((t, d) => t + Number(d.valor ?? 0), 0))}** em ${desp.length} lançamentos`)
const porFormaDesp = {}
for (const d of desp) { const k = d.forma_pagamento ?? '(sem)'; porFormaDesp[k] = (porFormaDesp[k] ?? 0) + Number(d.valor ?? 0) }
out('- por forma: ' + Object.entries(porFormaDesp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${brl(v)}`).join(' · '))
const semForma = desp.filter((d) => !d.forma_pagamento)
out(`- **sem forma de pagamento: ${semForma.length} · ${brl(semForma.reduce((t, d) => t + Number(d.valor ?? 0), 0))}**`)
const valePag = desp.filter((d) => /vale/i.test(d.forma_pagamento ?? ''))
out(`- pagos com "Vale Crédito": ${valePag.length} · ${brl(valePag.reduce((t, d) => t + Number(d.valor ?? 0), 0))} — despesa paga com crédito de cliente é suspeita`)

const dir = 'docs/fechamento/2026-10'
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(`${dir}/auditoria-app.md`, '# Auditoria do app — outubro/2026 (read-only)\n\n' + L.join('\n') + '\n', 'utf8')
console.log(`\nok: ${dir}/auditoria-app.md`)
