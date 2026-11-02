// Cruzamento final READ-ONLY: app × Papel × PIX × PagBank × dinheiro.
// Gera docs/fechamento/2026-10/cruzamento-final.md
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

const [{ data: lojas }, deps, cxs, formas] = await Promise.all([
  s.from('lojas').select('id, nome').order('nome'),
  tudo((a, b) => s.from('depositos').select('id, loja_id').range(a, b)),
  tudo((a, b) => s.from('caixas').select('id, loja_id, aberto_em, fechado_em, valor_abertura, valor_fechamento, status').range(a, b)),
  s.from('formas_pagamento').select('id, nome, tipo').then((r) => r.data ?? []),
])
const nomeLoja = (id) => lojas.find((l) => l.id === id)?.nome ?? '(sem loja)'
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))
const lojaCx = new Map(cxs.map((c) => [c.id, c.loja_id]))
const formaDe = new Map(formas.map((f) => [f.id, f]))

// ── 1. caixa: fechamento do app × fluxo calculado ───────────────────────
const vendas = await tudo((a, b) => s.from('vendas').select('id, total, deposito_id').eq('status', 'concluida').eq('uso_interno', false).gte('data', deTs).lt('data', ateTs).order('id').range(a, b))
const vendaLoja = new Map(vendas.map((v) => [v.id, lojaDep.get(v.deposito_id)]))
const pags = []
for (let i = 0; i < vendas.length; i += 200) {
  const lote = vendas.slice(i, i + 200).map((v) => v.id)
  pags.push(...await tudo((a, b) => s.from('pagamentos_venda').select('venda_id, valor, forma_pagamento_id, status').eq('status', 'pago').in('venda_id', lote).range(a, b)))
}
const movs = await tudo((a, b) => s.from('movimentos_caixa').select('tipo, forma_pagamento, valor, caixa_id').gte('created_at', deTs).lt('created_at', ateTs).range(a, b))
const ehD = (t) => (t ?? '').toLowerCase().includes('dinheiro')
const cxMes = cxs.filter((c) => c.aberto_em >= deTs && c.aberto_em < ateTs)

out('# Cruzamento final — outubro/2026 (read-only)')
out()
out('## 1. Caixa da loja: o app fecha com ele mesmo?')
out()
out('Compara `fechamento − abertura` dos 85 caixas com o fluxo de dinheiro calculado pelas vendas e movimentos.')
out()
for (const l of lojas) {
  const meus = cxMes.filter((c) => c.loja_id === l.id)
  const pelaGaveta = meus.reduce((t, c) => t + Number(c.valor_fechamento ?? 0) - Number(c.valor_abertura ?? 0), 0)
  const vdin = pags.filter((p) => vendaLoja.get(p.venda_id) === l.id && formaDe.get(p.forma_pagamento_id)?.tipo === 'dinheiro').reduce((t, p) => t + Number(p.valor ?? 0), 0)
  const mm = movs.filter((m) => lojaCx.get(m.caixa_id) === l.id && ehD(m.forma_pagamento))
  const entra = mm.filter((m) => m.tipo === 'recebimento' || m.tipo === 'reforco').reduce((t, m) => t + Number(m.valor ?? 0), 0)
  const sai = mm.filter((m) => m.tipo === 'retirada' || m.tipo === 'devolucao').reduce((t, m) => t + Number(m.valor ?? 0), 0)
  const fluxo = vdin + entra - sai
  out(`- **${l.nome}**: gaveta ${brl(pelaGaveta)} × fluxo ${brl(fluxo)} → diferença **${brl(pelaGaveta - fluxo)}**`)
}
out()

// ── 2. fornecedor: app × PIX ────────────────────────────────────────────
out('## 2. Fornecedor: o que está lançado no app × o que saiu no PIX')
out()
const desp = await tudo((a, b) => s.from('lancamentos').select('valor, categoria, pessoa_nome, data_pagamento, forma_pagamento, status').eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', deTs).lt('data_pagamento', ateTs).range(a, b))
const fornecedores = [
  { nome: 'H2O', pix: 121640.24, teste: /H2O|H²O/i },
  { nome: 'ADL', pix: 26919.15, teste: /ADL/i },
  { nome: 'ZL', pix: 13904.00, teste: /ZL/i },
  { nome: 'INOVA', pix: 15145.40, teste: /INOVA/i },
  { nome: 'PLANETA', pix: 255.00, teste: /PLANETA/i },
]
out('| Fornecedor | PIX real | Lançado no app | Falta lançar |')
out('|---|---|---|---|')
let totPix = 0, totApp = 0
for (const f of fornecedores) {
  const app = desp.filter((d) => f.teste.test(d.pessoa_nome ?? '')).reduce((t, d) => t + Number(d.valor ?? 0), 0)
  totPix += f.pix; totApp += app
  out(`| ${f.nome} | ${brl(f.pix)} | ${brl(app)} | ${brl(f.pix - app)} |`)
}
out(`| **Total** | **${brl(totPix)}** | **${brl(totApp)}** | **${brl(totPix - totApp)}** |`)
out()
const outrosForn = desp.filter((d) => /fornecedor|mercadoria/i.test(d.categoria ?? '') && !fornecedores.some((f) => f.teste.test(d.pessoa_nome ?? '')))
out(`Fornecedor lançado que NÃO aparece na lista PIX dos 5: **${brl(outrosForn.reduce((t, d) => t + Number(d.valor ?? 0), 0))}** em ${outrosForn.length} lançamentos`)
const porNome = {}
for (const d of outrosForn) { const k = d.pessoa_nome ?? '(sem nome)'; porNome[k] = (porNome[k] ?? 0) + Number(d.valor ?? 0) }
for (const [k, v] of Object.entries(porNome).sort((a, b) => b[1] - a[1])) out(`  - ${brl(v).padStart(12)} ${k}`)
out()

// ── 3. devoluções ───────────────────────────────────────────────────────
out('## 3. Devoluções de outubro')
out()
const devol = await tudo((a, b) => s.from('devolucoes').select('valor_total, tipo_credito, status, motivo_tipo, created_at').gte('created_at', deTs).lt('created_at', ateTs).range(a, b))
const porTipo = {}
for (const d of devol) { const k = `${d.tipo_credito ?? '(sem)'} · ${d.status ?? '(sem status)'}`; porTipo[k] ??= { n: 0, v: 0 }; porTipo[k].n++; porTipo[k].v += Number(d.valor_total ?? 0) }
out(`Total: ${devol.length} registros · ${brl(devol.reduce((t, d) => t + Number(d.valor_total ?? 0), 0))}`)
out()
out('| Tipo de crédito · status | Qtd | Valor |')
out('|---|---|---|')
for (const [k, v] of Object.entries(porTipo).sort((a, b) => b[1].v - a[1].v)) out(`| ${k} | ${v.n} | ${brl(v.v)} |`)
out()
const porDia = {}
for (const d of devol) { const dia = d.created_at.slice(0, 10); porDia[dia] = (porDia[dia] ?? 0) + 1 }
const diasOrdenados = Object.entries(porDia).sort((a, b) => b[1] - a[1])
out(`Dias com mais registros: ${diasOrdenados.slice(0, 5).map(([d, n]) => `${d} (${n})`).join(' · ')}`)
out()

// ── 4. despesas × bancos ────────────────────────────────────────────────
out('## 4. Despesas pagas: forma declarada × bancos que temos')
out()
const porForma = {}
for (const d of desp) { const k = d.forma_pagamento ?? '(sem forma)'; porForma[k] = (porForma[k] ?? 0) + Number(d.valor ?? 0) }
out('| Forma | Valor |')
out('|---|---|')
for (const [k, v] of Object.entries(porForma).sort((a, b) => b[1] - a[1])) out(`| ${k} | ${brl(v)} |`)
out(`| **Total** | **${brl(desp.reduce((t, d) => t + Number(d.valor ?? 0), 0))}** |`)
out()
const pagbankOut = 77688.75 // do extrato PagBank de outubro
out(`PagBank (extrato): saiu ${brl(pagbankOut)} em outubro. App declara PIX pago ${brl(porForma['PIX'] ?? 0)} + pix ${brl(porForma['pix'] ?? 0)} — mas PIX também sai pelo Cora, então só o extrato do Cora fecha essa conta.`)
out()

// ── 5. PIX recebido ─────────────────────────────────────────────────────
out('## 5. PIX recebido: app × PagBank')
out()
const appPixVendas = pags.filter((p) => formaDe.get(p.forma_pagamento_id)?.tipo === 'pix').reduce((t, p) => t + Number(p.valor ?? 0), 0)
const appPixFiado = movs.filter((m) => m.tipo === 'recebimento' && /pix/i.test(m.forma_pagamento ?? '')).reduce((t, m) => t + Number(m.valor ?? 0), 0)
out(`- app: PIX de venda ${brl(appPixVendas)} + PIX recebido de fiado ${brl(appPixFiado)} = **${brl(appPixVendas + appPixFiado)}**`)
out(`- PagBank: Pix recebido no extrato = **${brl(76407.59)}** (outubro)`)
out(`- Cora: **sem extrato de outubro** → ${brl(appPixVendas + appPixFiado - 76407.59)} de PIX recebido não tem banco pra conferir`)
out()

fs.writeFileSync('docs/fechamento/2026-10/cruzamento-final.md', L.join('\n') + '\n', 'utf8')
console.log('\nok: docs/fechamento/2026-10/cruzamento-final.md')
