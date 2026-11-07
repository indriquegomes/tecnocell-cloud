// READ-ONLY: lista exata do que falta lançar de pagamento a fornecedor em outubro.
// Compara, POR DIA E POR FORNECEDOR, o PIX do comprovante com o lançamento do app.
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
const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()

function grupo(nome, doc) {
  const d = String(doc ?? '').replace(/\D/g, '')
  if (d === '67262680000192') return 'H2O'
  if (d === '64486787000126') return 'ADL'
  if (d === '17966582000168') return 'ZL'
  if (d === '38216415000170') return null // CNPJ do dono, não é fornecedor
  const n = norm(nome)
  if (/STOR ONE|H2O|H2 /.test(n)) return 'H2O'
  if (/ARMACAO LONGITUDE|ADL/.test(n)) return 'ADL'
  if (/FERNANDES DA SILVA|PLANORH|FERREIRA E FERREIRA|ZL/.test(n)) return 'ZL'
  if (/ATRATIVA|INOVA/.test(n)) return 'INOVA'
  if (/PLAY CELL|PLANETA/.test(n)) return 'PLANETA'
  return null
}

// PIX de outubro por fornecedor e dia
const pix = await pagina('comprovantes_pix', 'valor, data_pix, destinatario, transacao_id, status, extraido_raw', (q) => q.gte('data_pix', '2026-10-01').lt('data_pix', '2026-11-01'))
const vistos = new Set()
const pixDia = {}
for (const r of pix) {
  if (r.status === 'apagado' || r.status === 'duplicado') continue
  if (r.extraido_raw?.eh_comprovante === false || !r.destinatario) continue
  const k = r.transacao_id || r.id
  if (vistos.has(k)) continue
  vistos.add(k)
  const g = grupo(r.destinatario, r.extraido_raw?.destinatario_doc)
  if (!g) continue
  pixDia[g] ??= {}
  pixDia[g][r.data_pix] = (pixDia[g][r.data_pix] ?? 0) + Number(r.valor ?? 0)
}

// app: lançamentos pagos de outubro, por fornecedor e dia
const desp = await pagina('lancamentos', 'valor, pessoa_nome, data_pagamento, categoria', (q) => q.eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', '2026-10-01T00:00:00-03:00').lt('data_pagamento', '2026-11-01T00:00:00-03:00'))
const appDia = {}
for (const d of desp) {
  const g = grupo(d.pessoa_nome ?? '')
  if (!g) continue
  const dia = (d.data_pagamento ?? '').slice(0, 10)
  appDia[g] ??= {}
  appDia[g][dia] = (appDia[g][dia] ?? 0) + Number(d.valor ?? 0)
}

out('# O que falta lançar de pagamento a fornecedor — outubro/2026')
out()
out('## Baseline autoritativo (relatório do dono, já validado no banco)')
out()
out('| Fornecedor | PIX | Lançado no app | Falta |')
out('|---|---|---|---|')
const baseline = [
  ['H2O', 121640.24, 100706.22],
  ['ADL', 26919.15, 20709.25],
  ['ZL', 13904.00, 12572.70],
  ['INOVA', 15145.40, 9908.60],
  ['PLANETA', 255.00, 156.00],
]
let bp = 0, ba = 0
for (const [n, p, a] of baseline) { bp += p; ba += a; out(`| ${n} | ${brl(p)} | ${brl(a)} | **${brl(p - a)}** |`) }
out(`| **Total** | **${brl(bp)}** | **${brl(ba)}** | **${brl(bp - ba)}** |`)
out()
out('> O lançado da H2O inclui a ficha "H2" (R$ 5.880,90) — o cadastro tem três fichas do mesmo fornecedor.')
out()
out('## Quebra por dia (lista de apoio)')
out()
out('Comparação por dia e por fornecedor. Serve para achar **quais** pagamentos faltam; a soma desta')
out('lista fica um pouco menor que o baseline porque comprovante com nome mascarado ("STOR *** ****")')
out('não entra no casamento por nome.')
out()
out('| Fornecedor | Dia | PIX | Lançado no app | Falta lançar |')
out('|---|---|---|---|---|')
const faltando = []
let totalFalta = 0, totalSobra = 0
for (const g of Object.keys(pixDia).sort()) {
  const dias = [...new Set([...Object.keys(pixDia[g] ?? {}), ...Object.keys(appDia[g] ?? {})])].sort()
  for (const dia of dias) {
    const p = pixDia[g]?.[dia] ?? 0
    const a = appDia[g]?.[dia] ?? 0
    const dif = p - a
    if (Math.abs(dif) < 0.01) continue
    if (dif > 0) { faltando.push({ g, dia, p, a, dif }); totalFalta += dif } else totalSobra += dif
    out(`| ${g} | ${dia.slice(8, 10)}/${dia.slice(5, 7)} | ${brl(p)} | ${brl(a)} | **${brl(dif)}** |`)
  }
}
out()
out(`**Total a lançar: ${brl(totalFalta)}** · diferença do outro lado (lançado a mais que o PIX): ${brl(totalSobra)} · saldo ${brl(totalFalta + totalSobra)}`)
out()
out('## Resumo por fornecedor')
out()
out('| Fornecedor | PIX do mês | Lançado no app | Falta |')
out('|---|---|---|---|')
for (const g of Object.keys(pixDia).sort()) {
  const p = Object.values(pixDia[g]).reduce((t, v) => t + v, 0)
  const a = Object.values(appDia[g] ?? {}).reduce((t, v) => t + v, 0)
  out(`| ${g} | ${brl(p)} | ${brl(a)} | **${brl(p - a)}** |`)
}
out()
out('## Os lançamentos maiores (os que mais pesam)')
out()
out('| Fornecedor | Dia | Valor faltando |')
out('|---|---|---|')
for (const f of faltando.sort((a, b) => b.dif - a.dif).slice(0, 20)) out(`| ${f.g} | ${f.dia.slice(8, 10)}/${f.dia.slice(5, 7)} | ${brl(f.dif)} |`)

fs.writeFileSync('docs/registros/2026-10/falta-lancar-fornecedor.md', L.join('\n') + '\n', 'utf8')
console.log('\nok: docs/registros/2026-10/falta-lancar-fornecedor.md')
