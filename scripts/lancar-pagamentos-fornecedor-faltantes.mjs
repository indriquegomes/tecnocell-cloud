// LANÇA (escreve) os pagamentos a fornecedor que faltam em outubro (diferença PIX × app, dia a dia).
// Autorizado pelo dono em 26/10/2026. Backup + idempotente (descrição CONF FECHAMENTO OUT/2026).
// Uso: node scripts/lancar-pagamentos-fornecedor-faltantes.mjs [--gravar]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GRAVAR = process.argv.includes('--gravar')
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function P(t, c, f, o = 'id') { const r = []; for (let p = 0; ; p++) { let q = s.from(t).select(c); if (f) q = f(q); const { data, error } = await q.order(o).range(p * 1000, p * 1000 + 999); if (error) throw new Error(t + ': ' + error.message); if (!data.length) break; r.push(...data); if (data.length < 1000) break } return r }

const FICHAS = [
  { nome: 'H2O FORNECEDOR', id: '698ca68bab433fc39fef7b75', docs: ['67262680000192'], teste: /STOR ONE|STOR \*+|H2O|H2/ },
  { nome: 'ADL FORNECEDOR', id: '69d6bb5139449d9509f24978', docs: ['64486787000126'], teste: /ARMACAO LONGITUDE|ADL/ },
  { nome: 'ZL CELL FORNECEDOR', id: '6537e9a5252e1067daf498a3', docs: ['17966582000168'], teste: /FERNANDES DA SILVA|PLANORH|FERREIRA E FERREIRA|ZL CELL/ },
  { nome: 'INOVA MERCADORIAS', id: '63fcac1fb418e8b1b3a3471e', docs: [], teste: /ATRATIVA|INOVA/ },
  { nome: 'PLANETA CELL', id: '63e6375b0a7df67f3f2d1d29', docs: [], teste: /PLAY CELL|PLANETA/ },
]
const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
function grupo(nome, doc) {
  const d = String(doc ?? '').replace(/\D/g, '')
  if (d === '38216415000170') return null
  for (const f of FICHAS) if (f.docs.includes(d) || f.teste.test(norm(nome))) return f
  return null
}

// PIX por fornecedor/dia
const pix = await P('comprovantes_pix', 'id, valor, data_pix, destinatario, transacao_id, status, extraido_raw', (q) => q.gte('data_pix', '2026-10-01').lt('data_pix', '2026-11-01'))
const vistos = new Set()
const pixDia = {}
for (const r of pix) {
  if (r.status === 'apagado' || r.status === 'duplicado') continue
  if (r.extraido_raw?.eh_comprovante === false || !r.destinatario) continue
  const k = r.transacao_id || r.id
  if (vistos.has(k)) continue
  vistos.add(k)
  const f = grupo(r.destinatario, r.extraido_raw?.destinatario_doc)
  if (!f) continue
  pixDia[f.nome] ??= {}
  pixDia[f.nome][r.data_pix] = (pixDia[f.nome][r.data_pix] ?? 0) + Number(r.valor ?? 0)
}
// app por fornecedor/dia
const desp = await P('lancamentos', 'valor, pessoa_nome, data_pagamento', (q) => q.eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', '2026-10-01T00:00:00-03:00').lt('data_pagamento', '2026-11-01T00:00:00-03:00'))
const appDia = {}
for (const d of desp) {
  const f = grupo(d.pessoa_nome, '')
  if (!f) continue
  const dia = (d.data_pagamento ?? '').slice(0, 10)
  appDia[f.nome] ??= {}
  appDia[f.nome][dia] = (appDia[f.nome][dia] ?? 0) + Number(d.valor ?? 0)
}

const existentes = new Set((await P('lancamentos', 'descricao', (q) => q.ilike('descricao', 'CONF FECHAMENTO OUT/2026%'))).map((l) => l.descricao))
// UM lançamento por fornecedor com o SALDO do mês (PIX do mês − lançado no mês).
// É o número certo: no dia a dia há dias lançados a mais e dias a menos, que se anulam.
const linhas = []
for (const f of FICHAS) {
  const p = Object.values(pixDia[f.nome] ?? {}).reduce((t, v) => t + v, 0)
  const a = Object.values(appDia[f.nome] ?? {}).reduce((t, v) => t + v, 0)
  const dif = Math.round((p - a) * 100) / 100
  if (dif < 0.01) continue
  const desc = `CONF FECHAMENTO OUT/2026 — saldo de pagamentos do mês — ${f.nome}`
  if (existentes.has(desc)) continue
  linhas.push({
    tipo: 'pagar', status: 'pago', valor: dif, valor_pago: dif,
    data_competencia: '2026-10-28', data_vencimento: '2026-10-28', data_pagamento: '2026-10-28T12:00:00-03:00',
    forma_pagamento: 'PIX', categoria: 'Fornecedor / Mercadoria',
    pessoa_id: f.id, pessoa_nome: f.nome, descricao: desc,
  })
}
const total = linhas.reduce((t, l) => t + l.valor, 0)
console.log('lançamentos a criar:', linhas.length, '·', brl(total))
const porForn = {}
for (const l of linhas) porForn[l.pessoa_nome] = (porForn[l.pessoa_nome] ?? 0) + l.valor
for (const [k, v] of Object.entries(porForn).sort((a, b) => b[1] - a[1])) console.log('  ', brl(v).padStart(12), k)
console.log('\nmaiores:')
for (const l of [...linhas].sort((a, b) => b.valor - a.valor).slice(0, 8)) console.log('  ', l.data_pagamento.slice(0, 10), brl(l.valor).padStart(11), l.pessoa_nome)

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado)'); process.exit(0) }
if (!linhas.length) { console.log('nada a fazer'); process.exit(0) }

const dir = 'docs/registros-banco/2026-10'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/pagamentos-fornecedor-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), linhas }, null, 2), 'utf8')
const { data, error } = await s.from('lancamentos').insert(linhas).select('id, valor')
if (error) { console.error('erro:', error.message); process.exit(1) }
console.log(`\ngravados ${data.length} · ${brl(data.reduce((t, l) => t + Number(l.valor), 0))}`)
fs.writeFileSync(`${dir}/DESFAZER-pagamentos-fornecedor-${carimbo}.sql`, `DELETE FROM lancamentos WHERE id IN (${data.map((l) => `'${l.id}'`).join(',')});\n`, 'utf8')
console.log(`backup e desfazer em ${dir}`)
