// Dá loja (loja_id) a todos os lançamentos de fornecedor da conferência (CONF FECHAMENTO OUT/2026).
// Regra:
//  • os 19 de dinheiro vivo: pela divisão dos ITENS de cada nota (nota → depósito → loja)
//  • os 5 de PIX (saldo do mês): pela proporção PAGA de cada fornecedor no papel do dono
// Se um lançamento tiver os dois lados, ele é dividido em dois (um por loja), mantendo o total.
// Uso: node scripts/dar-loja-aos-lancamentos.mjs [--gravar]
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

const { data: lojas } = await s.from('lojas').select('id, nome')
const PET = lojas.find((l) => l.nome === 'Petrópolis').id
const TERE = lojas.find((l) => l.nome === 'Teresópolis').id
const deps = await P('depositos', 'id, loja_id')
const lojaDep = new Map(deps.map((d) => [d.id, d.loja_id]))

// proporção paga por loja, por fornecedor (do papel do dono, out/2026)
const RATIO = {
  'H2O FORNECEDOR': { pet: 66057.89, tere: 49425.05 },
  'ADL FORNECEDOR': { pet: 16809.06, tere: 10048.09 },
  'ZL CELL FORNECEDOR': { pet: 9971.00, tere: 3650.00 },
  'INOVA MERCADORIAS': { pet: 5315.20, tere: 9791.20 },
  'PLANETA CELL': { pet: 0, tere: 255.00 },
}

const alvo = await P('lancamentos', 'id, valor, valor_pago, status, data_pagamento, data_competencia, data_vencimento, forma_pagamento, categoria, pessoa_id, pessoa_nome, descricao, loja_id', (q) => q.ilike('descricao', 'CONF FECHAMENTO OUT/2026%'))
console.log('lançamentos da conferência:', alvo.length)

// itens por nota (para os de dinheiro vivo)
const notas = await P('notas_entrada', 'id, numero')
const notaPorNumero = new Map(notas.map((n) => [String(n.numero), n.id]))
const itens = await P('itens_nota_entrada', 'nota_id, deposito_id, total_item')
const porNota = new Map()
for (const it of itens) {
  const loja = lojaDep.get(it.deposito_id)
  const cur = porNota.get(it.nota_id) ?? { pet: 0, tere: 0 }
  if (loja === PET) cur.pet += Number(it.total_item ?? 0)
  else if (loja === TERE) cur.tere += Number(it.total_item ?? 0)
  porNota.set(it.nota_id, cur)
}

const plano = [] // { atualizar: id, loja }; { criar: {...}, loja }
for (const l of alvo) {
  if (l.descricao.includes('nota de entrada nº')) {
    const num = l.descricao.split('nº')[1].trim()
    const nid = notaPorNumero.get(num)
    const split = porNota.get(nid) ?? { pet: 0, tere: 0 }
    const total = split.pet + split.tere
    if (!total) { console.log('  ⚠ nota', num, 'sem itens — fica como está'); continue }
    const petParte = Math.round((Number(l.valor) * (split.pet / total)) * 100) / 100
    const tereParte = Math.round((Number(l.valor) - petParte) * 100) / 100
    if (petParte > 0.009 && tereParte > 0.009) {
      plano.push({ atualizar: { id: l.id, loja: PET, valor: petParte }, criar: { ...l, id: undefined, valor: tereParte, valor_pago: tereParte, loja_id: TERE, descricao: l.descricao + ' — parte Teresópolis' } })
    } else {
      plano.push({ atualizar: { id: l.id, loja: tereParte > 0.009 ? TERE : PET, valor: null } })
    }
  } else {
    const r = RATIO[l.pessoa_nome ?? ''] ?? { pet: 1, tere: 0 }
    const tot = r.pet + r.tere || 1
    const petParte = Math.round((Number(l.valor) * (r.pet / tot)) * 100) / 100
    const tereParte = Math.round((Number(l.valor) - petParte) * 100) / 100
    if (petParte > 0.009 && tereParte > 0.009) {
      plano.push({ atualizar: { id: l.id, loja: PET, valor: petParte }, criar: { ...l, id: undefined, valor: tereParte, valor_pago: tereParte, loja_id: TERE, descricao: l.descricao + ' — parte Teresópolis' } })
    } else {
      plano.push({ atualizar: { id: l.id, loja: tereParte > 0.009 ? TERE : PET, valor: null } })
    }
  }
}

let somaAtual = 0, somaNovo = 0
for (const p of plano) {
  const l0 = alvo.find((x) => x.id === p.atualizar.id); somaAtual += p.atualizar.valor ?? Number(l0?.valor ?? 0)
  if (p.criar) somaNovo += p.criar.valor
}
const totalAntes = alvo.reduce((t, l) => t + Number(l.valor ?? 0), 0)
console.log('a atualizar:', plano.length, '· a criar:', plano.filter((p) => p.criar).length)
console.log('total hoje:', brl(totalAntes), '· soma das partes novas:', brl(somaAtual + somaNovo))
for (const p of plano) {
  const l = alvo.find((x) => x.id === p.atualizar.id)
  console.log('  ', (l.descricao || '').slice(0, 58).padEnd(58), '→', brl(l.valor), 'vira', brl(p.atualizar.valor ?? l.valor), 'na', p.atualizar.loja === PET ? 'Petrópolis' : 'Teresópolis', p.criar ? `+ ${brl(p.criar.valor)} em Teresópolis` : '')
}

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado)'); process.exit(0) }

const dir = 'docs/registros-banco/2026-10'
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(`${dir}/loja-lancamentos-antes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify({ quando: new Date().toISOString(), alvo }, null, 2), 'utf8')

for (const p of plano) {
  const campos = { loja_id: p.atualizar.loja }
  if (p.atualizar.valor != null) { campos.valor = p.atualizar.valor; campos.valor_pago = p.atualizar.valor }
  const { error } = await s.from('lancamentos').update(campos).eq('id', p.atualizar.id)
  if (error) { console.error('erro update:', error.message); process.exit(1) }
  if (p.criar) {
    const novo = { ...p.criar }
    delete novo.id
    const { error: e2 } = await s.from('lancamentos').insert(novo)
    if (e2) { console.error('erro insert:', e2.message); process.exit(1) }
  }
}
console.log('\npronto. conferindo:')
const depois = await P('lancamentos', 'valor, loja_id, descricao', (q) => q.ilike('descricao', 'CONF FECHAMENTO OUT/2026%'))
const pet = depois.filter((l) => l.loja_id === PET).reduce((t, l) => t + Number(l.valor ?? 0), 0)
const tere = depois.filter((l) => l.loja_id === TERE).reduce((t, l) => t + Number(l.valor ?? 0), 0)
const sem = depois.filter((l) => !l.loja_id).length
console.log('  lançamentos:', depois.length, '· total', brl(pet + tere))
console.log('  Petrópolis ....', brl(pet))
console.log('  Teresópolis ...', brl(tere))
console.log('  sem loja ......', sem)
