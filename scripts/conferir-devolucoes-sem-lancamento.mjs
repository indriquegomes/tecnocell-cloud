// SÓ LEITURA — detector de devolução mal fechada, para rodar antes do Fechamento do Mês.
//
// Alerta três situações que furam o resultado do mês:
//   1. devolução com valor A DEVOLVER (pago pelo cliente) registrada como
//      'sem_reembolso'/'cancelamento_fiado' → o app não lançou saída nenhuma;
//   2. devolução que cancelou fiado E tem lançamento "Devolução —" do mesmo valor
//      no mês → cliente recebeu a dívida perdoada e o dinheiro;
//   3. devolução com crédito em conta que também tem lançamento de devolução do
//      mesmo valor → pagou duas vezes (crédito + dinheiro).
//
// Uso: node scripts/conferir-devolucoes-sem-lancamento.mjs 2026-11
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const P = 1000
async function tudo(f) { const o = []; for (let i = 0; i < 400000; i += P) { const { data, error } = await f(i, i + P - 1); if (error) throw new Error(error.message); if (!data?.length) break; o.push(...data); if (data.length < P) break } return o }
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const dia = (x) => (x ?? '').slice(0, 10)

const mes = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
if (!/^\d{4}-\d{2}$/.test(mes)) { console.error('mês inválido. Ex.: node scripts/conferir-devolucoes-sem-lancamento.mjs 2026-11'); process.exit(1) }
const [ano, m] = mes.split('-').map(Number)
const de = `${mes}-01T00:00:00-03:00`
const ate = m === 12 ? `${ano + 1}-01-01T00:00:00-03:00` : `${ano}-${String(m + 1).padStart(2, '0')}-01T00:00:00-03:00`

const devs = await tudo((a, b) => s.from('devolucoes')
  .select('id, pessoa_nome, valor_total, abate_fiado, tipo_credito, motivo_tipo, created_at, venda_id')
  .gte('created_at', de).lt('created_at', ate).range(a, b))
const lanc = await tudo((a, b) => s.from('lancamentos')
  .select('descricao, valor, data_pagamento, categoria, conta_id')
  .eq('tipo', 'pagar').ilike('descricao', 'Devolução%')
  .gte('data_pagamento', de).lt('data_pagamento', ate).range(a, b))
// créditos de devolução que já foram estornados (o dinheiro foi pago, o crédito cancelado)
const estornos = await tudo((a, b) => s.from('creditos_clientes')
  .select('devolucao_id, valor, tipo, descricao')
  .eq('tipo', 'estorno').gte('created_at', de).lt('created_at', ate).range(a, b))

// Casa lançamento por NOME (alguma palavra do nome do cliente aparece na descrição)
// E valor, com data a até 3 dias. Só valor+data dá falso positivo demais (15, 55, 76
// repetem o dia inteiro); só nome dá falso negativo quando o lançamento usa o nome
// fantasia (TEREMAQCELL × AMILTON, por exemplo) — por isso as palavras são testadas
// uma a uma.
const dias = (a, b) => Math.abs((new Date(dia(a) + 'T12:00:00Z') - new Date(dia(b) + 'T12:00:00Z')) / 86400000)
const achaLanc = (d, valorEsperado) => {
  const nome = norm(d.pessoa_nome)
  const longas = nome.split(' ').filter((p) => p.length >= 4)
  const curtas = nome.split(' ').filter((p) => p.length >= 3)
  const pistas = longas.length ? longas : curtas
  // valor certo é o que o CLIENTE pagou (total − fiado abatido), não o total da devolução
  const alvo = Number(valorEsperado ?? d.valor_total ?? 0)
  return lanc.find((l) => {
    if (Math.abs(Number(l.valor || 0) - alvo) > 0.011) return false
    if (dias(l.data_pagamento, d.created_at) > 3) return false
    const desc = norm(l.descricao)
    if (!pistas.length) return desc.includes(nome) // nome curtinho: exige o nome inteiro
    return desc.includes(nome) || pistas.some((p) => desc.includes(p))
  })
}
const creditEstornado = (d) => estornos.some((e) => e.devolucao_id === d.id)

const semForma = [], fiadoMaisDinheiro = [], creditoMaisDinheiro = []
for (const d of devs) {
  const total = Number(d.valor_total || 0)
  const abate = Number(d.abate_fiado || 0)
  const pago = Math.round((total - abate) * 100) / 100 // parte que o cliente realmente pagou
  const temLanc = achaLanc(d, pago)
  if (pago > 0.005 && ['sem_reembolso', 'cancelamento_fiado'].includes(d.tipo_credito) && !temLanc) semForma.push({ d, pago })
  if (abate > 0.005 && temLanc && Math.abs(Number(temLanc.valor || 0) - abate) < 0.011) fiadoMaisDinheiro.push({ d, abate, lanc: temLanc })
  if (d.tipo_credito === 'credito_conta' && temLanc && !creditEstornado(d)) creditoMaisDinheiro.push({ d, lanc: temLanc })
}

const total = (xs, f) => xs.reduce((t, x) => t + f(x), 0)
console.log(`\nConferência de devoluções — ${mes}\n`)
console.log(`devoluções no período: ${devs.length} · lançamentos "Devolução —": ${lanc.length}`)

console.log(`\n🔴 1) Valor A DEVOLVER sem forma de pagamento: ${semForma.length} · R$ ${brl(total(semForma, (x) => x.pago))}`)
for (const { d, pago } of semForma) console.log(`   ${dia(d.created_at)} ${brl(pago).padStart(10)} ${(d.tipo_credito || '-').padEnd(18)} ${(d.pessoa_nome || '-').slice(0, 34)} — o cliente pagou essa parte e o app não lançou saída`)

console.log(`\n🔴 2) Fiado cancelado E dinheiro pago: ${fiadoMaisDinheiro.length} · R$ ${brl(total(fiadoMaisDinheiro, (x) => x.abate))}`)
for (const { d, abate, lanc: l } of fiadoMaisDinheiro) console.log(`   ${dia(d.created_at)} fiado ${brl(abate).padStart(9)} + lançamento ${brl(l.valor).padStart(9)} ${(d.pessoa_nome || '-').slice(0, 30)} (${l.descricao.slice(0, 40)})`)

console.log(`\n🟡 3) Crédito em conta E dinheiro pago: ${creditoMaisDinheiro.length} · R$ ${brl(total(creditoMaisDinheiro, (x) => Number(x.d.valor_total || 0)))}`)
for (const { d, lanc: l } of creditoMaisDinheiro) console.log(`   ${dia(d.created_at)} crédito ${brl(d.valor_total).padStart(9)} + lançamento ${brl(l.valor).padStart(9)} ${(d.pessoa_nome || '-').slice(0, 30)}`)

const problemas = semForma.length + fiadoMaisDinheiro.length + creditoMaisDinheiro.length
console.log(problemas ? `\n${problemas} devolução(ões) para olhar antes de fechar o mês.` : '\nnada a apontar — devolução e dinheiro combinando.')
