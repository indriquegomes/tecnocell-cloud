// LANÇA (escreve) a dívida real das lojas e apaga as pendências velhas dos 4 fornecedores.
// Autorizado pelo dono em 26/10/2026 ("consertar agora de uma vez por todas").
// Verdade: Petrópolis 3.361,88 · Teresópolis 11.158,22 · INOVA 35.495,30 (já ajustada).
// Uso: node scripts/consertar-divida-lojas.mjs [--gravar]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GRAVAR = process.argv.includes('--gravar')
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function P(t, c, f, o = 'id') { const r = []; for (let p = 0; ; p++) { let q = s.from(t).select(c); if (f) q = f(q); const { data, error } = await q.order(o).range(p * 1000, p * 1000 + 999); if (error) throw new Error(t + ': ' + error.message); if (!data.length) break; r.push(...data); if (data.length < 1000) break } return r }

const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')
const pet = lojas.find((l) => l.nome === 'Petrópolis')
const tere = lojas.find((l) => l.nome === 'Teresópolis')
const VALORES = [
  { loja: pet, valor: 3361.88, nome: 'Petrópolis' },
  { loja: tere, valor: 11158.22, nome: 'Teresópolis' },
]

const pend = await P('lancamentos', 'id, valor, valor_pago, pessoa_nome, descricao, data_vencimento, loja_id', (q) => q.eq('tipo', 'pagar').eq('status', 'pendente'))
const GRUPO = (n) => /H2O|H2|STOR ONE/i.test(n) ? 'H2O' : /ADL|ARMACAO/i.test(n) ? 'ADL' : /ZL|FERNANDES/i.test(n) ? 'ZL' : /PLANETA|PLAY CELL/i.test(n) ? 'PLANETA' : null
const daLista = pend.filter((l) => GRUPO(l.pessoa_nome ?? ''))
const soma = daLista.reduce((t, l) => t + Number(l.valor ?? 0) - Number(l.valor_pago ?? 0), 0)

console.log('Pendências dos 4 fornecedores no app hoje:', daLista.length, 'lançamentos ·', brl(soma))
const porGrupo = {}
for (const l of daLista) { const g = GRUPO(l.pessoa_nome); porGrupo[g] = (porGrupo[g] ?? 0) + Number(l.valor ?? 0) - Number(l.valor_pago ?? 0) }
for (const [g, v] of Object.entries(porGrupo).sort((a, b) => b[1] - a[1])) console.log('   ', g.padEnd(8), brl(v))
console.log()
console.log('Vai ficar:')
for (const v of VALORES) console.log(`   ${v.nome.padEnd(12)} ${brl(v.valor)}  (1 lançamento pendente, venc. 30/11/2026)`)
console.log(`   ${'TOTAL'.padEnd(12)} ${brl(VALORES.reduce((t, v) => t + v.valor, 0))}`)
console.log(`\nApaga ${daLista.length} lançamentos que somam ${brl(soma)}`)

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado)'); process.exit(0) }

const dir = 'docs/registros-banco/2026-10'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/divida-lojas-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), apagados: daLista }, null, 2), 'utf8')
console.log(`backup: ${dir}/divida-lojas-antes-${carimbo}.json`)

if (daLista.length) {
  const { error } = await s.from('lancamentos').delete().in('id', daLista.map((l) => l.id))
  if (error) { console.error('erro ao apagar:', error.message); process.exit(1) }
  console.log(`apagados ${daLista.length}`)
}

const { error: e2 } = await s.from('lancamentos').insert(VALORES.map((v) => ({
  tipo: 'pagar', status: 'pendente', valor: v.valor, valor_pago: 0,
  data_competencia: '2026-10-31', data_vencimento: '2026-11-30', data_pagamento: null,
  forma_pagamento: null, categoria: 'Fornecedor / Mercadoria',
  loja_id: v.loja?.id ?? null,
  pessoa_nome: null,
  descricao: `Dívida de fornecedor — outubro/2026 (compras até 28/10) — ${v.nome}`,
})))
if (e2) { console.error('erro ao criar:', e2.message); process.exit(1) }
console.log('criados 2 lançamentos pendentes')

const depois = await P('lancamentos', 'id, valor, valor_pago, status, pessoa_nome, loja_id')
const inv = depois.filter((l) => /INOVA|ATRATIVA/i.test(l.pessoa_nome ?? '') && l.status === 'pendente')
const lojasPend = depois.filter((l) => (l.descricao ?? '').startsWith('Dívida de fornecedor') === false && false)
void lojasPend
const meus = depois.filter((l) => l.status === 'pendente' && (l.descricao ?? '').includes('outubro/2026 (compras até 28/10)'))
console.log('\nestado final:')
console.log('  INOVA pendente .......', brl(inv.reduce((t, l) => t + Number(l.valor ?? 0) - Number(l.valor_pago ?? 0), 0)))
for (const l of meus) console.log('  dívida loja ..........', brl(Number(l.valor)), '(loja_id', l.loja_id + ')')
const totalPend = depois.filter((l) => l.status === 'pendente').reduce((t, l) => t + Number(l.valor ?? 0) - Number(l.valor_pago ?? 0), 0)
console.log('  total "A Pagar" do app:', brl(totalPend))
