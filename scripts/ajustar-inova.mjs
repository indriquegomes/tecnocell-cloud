// LANÇA (escreve) o resumo do INOVA — autorizado pelo dono em 26/10/2026.
// Regra: tira todo o histórico do INOVA do app e deixa só 3 números:
//   • dívida total (compras) .... R$ 276.298,88
//   • já pago ................... R$ 240.803,58
//   • falta pagar .............. R$  35.495,30
// Para não mexer no resultado de outubro, os pagamentos de outubro que já estão lançados
// (R$ 9.908,60) ficam como estão; o histórico anterior entra num único lançamento pago
// com data 30/09/2026 (R$ 230.894,98 = 240.803,58 − 9.908,60).
// Uso: node scripts/ajustar-inova.mjs [--gravar]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GRAVAR = process.argv.includes('--gravar')
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TOTAL_COMPRAS = 276298.88
const TOTAL_PAGO = 240803.58
const FALTA = 35495.30

async function P(t, c, f, o = 'id') { const r = []; for (let p = 0; ; p++) { let q = s.from(t).select(c); if (f) q = f(q); const { data, error } = await q.order(o).range(p * 1000, p * 1000 + 999); if (error) throw new Error(t + ': ' + error.message); if (!data.length) break; r.push(...data); if (data.length < 1000) break } return r }

const todos = await P('lancamentos', 'id, valor, valor_pago, status, data_pagamento, descricao, pessoa_nome, categoria')
const inova = todos.filter((l) => /INOVA|ATRATIVA/i.test(l.pessoa_nome ?? ''))
const pendentes = inova.filter((l) => l.status === 'pendente')
const pagosOut = inova.filter((l) => l.status === 'pago' && (l.data_pagamento ?? '').slice(0, 7) === '2026-10')
const pagosOutros = inova.filter((l) => l.status === 'pago' && (l.data_pagamento ?? '').slice(0, 7) !== '2026-10')
const soma = (a) => a.reduce((t, l) => t + Number(l.valor ?? 0), 0)

console.log('INOVA no app hoje:')
console.log('  pendentes:', pendentes.length, brl(soma(pendentes)))
console.log('  pagos em outubro:', pagosOut.length, brl(soma(pagosOut)), '(FICAM — são pagamentos reais de outubro)')
console.log('  pagos em outros meses:', pagosOutros.length, brl(soma(pagosOutros)), '(saem — o histórico passa a ser um só)')
const historico = TOTAL_PAGO - soma(pagosOut)
console.log()
console.log('Plano:')
console.log(`  1) apagar ${pendentes.length} pendentes (${brl(soma(pendentes))})`)
console.log(`  2) apagar ${pagosOutros.length} pagos antigos (${brl(soma(pagosOutros))})`)
console.log(`  3) criar 1 lançamento PAGO de ${brl(historico)} com data 30/09/2026 (histórico até 30/09)`)
console.log(`  4) criar 1 lançamento PENDENTE de ${brl(FALTA)} com vencimento 30/11/2026 (saldo devedor em 30/10)`)
console.log()
console.log('Conferência que vai fechar:')
console.log('  dívida total (compras) .....', brl(TOTAL_COMPRAS))
console.log('  pago (outubro + histórico) .', brl(soma(pagosOut) + historico), '→', brl(TOTAL_PAGO))
console.log('  falta pagar ................', brl(FALTA))

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado)'); process.exit(0) }

const dir = 'docs/fechamento/2026-10/backups'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/inova-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), pendentes, pagosOutros, pagosOut }, null, 2), 'utf8')
console.log(`\nbackup: ${dir}/inova-antes-${carimbo}.json`)

const ids = [...pendentes, ...pagosOutros].map((l) => l.id)
if (ids.length) {
  const { error } = await s.from('lancamentos').delete().in('id', ids)
  if (error) { console.error('erro ao apagar:', error.message); process.exit(1) }
  console.log(`apagados ${ids.length} lançamentos de INOVA`)
}

const { data: criados, error: e2 } = await s.from('lancamentos').insert([
  {
    tipo: 'pagar', status: 'pago', valor: historico, valor_pago: historico,
    data_competencia: '2026-09-30', data_vencimento: '2026-09-30', data_pagamento: '2026-09-30T12:00:00-03:00',
    forma_pagamento: 'PIX', categoria: 'Fornecedor / Mercadoria',
    pessoa_nome: 'INOVA MERCADORIAS',
    descricao: 'INOVA — histórico de pagamentos até 30/09/2026 (total pago R$ 240.803,58, dos quais R$ 9.908,60 lançados em outubro)',
  },
  {
    tipo: 'pagar', status: 'pendente', valor: FALTA, valor_pago: 0,
    data_competencia: '2026-10-30', data_vencimento: '2026-11-30', data_pagamento: null,
    forma_pagamento: null, categoria: 'Fornecedor / Mercadoria',
    pessoa_nome: 'INOVA MERCADORIAS',
    descricao: 'INOVA — saldo devedor em 30/10/2026 (dívida total R$ 276.298,88 − pago R$ 240.803,58)',
  },
]).select('id, descricao, valor, status')
if (e2) { console.error('erro ao criar:', e2.message); process.exit(1) }
console.log('criados:', criados.map((c) => `${c.status} ${brl(c.valor)}`).join(' · '))

const dep = await P('lancamentos', 'id, valor, valor_pago, status, pessoa_nome')
const inv = dep.filter((l) => /INOVA|ATRATIVA/i.test(l.pessoa_nome ?? ''))
console.log('\nestado final do INOVA no app:')
for (const l of inv) console.log(`  ${l.status.padEnd(9)} ${brl(l.valor)}`)
console.log(`  pago total: ${brl(inv.filter((l) => l.status === 'pago').reduce((t, l) => t + Number(l.valor ?? 0), 0))}`)
console.log(`  pendente:   ${brl(inv.filter((l) => l.status === 'pendente').reduce((t, l) => t + Number(l.valor ?? 0) - Number(l.valor_pago ?? 0), 0))}`)
