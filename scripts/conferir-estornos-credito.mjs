// SÓ LEITURA — conferência dos estornos de crédito antes do fechamento do mês.
//
// O caso que motivou o script (RODRIGO PEREIRA, 21/11/2026): a atendente estornou o
// crédito de peças devolvidas DEPOIS de o reembolso já ter sido pago em PIX. Isso
// deixou o cliente com dinheiro recebido + crédito preso no saldo + uma conta a pagar
// que não existia. Hoje a ação "estornar crédito" já recusa esse caminho; este script
// procura o que passou antes da trava.
//
// Alerta três coisas:
//   1. estorno de crédito com "a pagar" ainda aberto e reembolso da devolução já pago;
//   2. crédito estornado cujo valor continua no saldo do cliente (peça devolvida e
//      reembolsada, mas o crédito não saiu);
//   3. "Estorno de crédito" pendente parado (dinheiro que a loja deve ao cliente).
//
// Uso: node scripts/conferir-estornos-credito.mjs 2026-11
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
const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
const dia = (x) => (x ?? '').slice(0, 10)

const mes = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
if (!/^\d{4}-\d{2}$/.test(mes)) { console.error('mês inválido. Ex.: node scripts/conferir-estornos-credito.mjs 2026-11'); process.exit(1) }
const [ano, m] = mes.split('-').map(Number)
const de = `${mes}-01`
const ate = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`

const estornos = await tudo((a, b) => s.from('creditos_clientes')
  .select('id, pessoa_id, pessoa_nome, valor, tipo, descricao, created_at, devolucao_id, estorna_credito_id, loja_id')
  .eq('tipo', 'estorno').gte('created_at', de).lt('created_at', ate).range(a, b))
const lanc = await tudo((a, b) => s.from('lancamentos')
  .select('id, descricao, valor, status, categoria, data_pagamento, data_vencimento, pessoa_nome, devolucao_id')
  .eq('tipo', 'pagar').gte('data_vencimento', '2026-09-01').range(a, b))
const creditos = await tudo((a, b) => s.from('creditos_clientes')
  .select('pessoa_id, pessoa_nome, valor, tipo, loja_id').range(a, b))

const saldo = (pessoaId) => Math.round(creditos
  .filter((c) => c.pessoa_id === pessoaId)
  .reduce((t, c) => t + (['uso', 'estorno'].includes(c.tipo) ? -Number(c.valor || 0) : Number(c.valor || 0)), 0) * 100) / 100

const reembolsoDaDevolucao = (e) => lanc.find((l) => l.status === 'pago' &&
  ((e.devolucao_id && l.devolucao_id === e.devolucao_id) ||
    (/^Devolução —/i.test(l.descricao ?? '') && norm(l.pessoa_nome) === norm(e.pessoa_nome) && Math.abs(Number(l.valor) - Number(e.valor)) < 0.011)))

const aPagarDoEstorno = (e) => lanc.find((l) => l.categoria === 'Estorno de crédito' &&
  norm(l.pessoa_nome) === norm(e.pessoa_nome) && Math.abs(Number(l.valor) - Number(e.valor)) < 0.011)

const grupo1 = [], grupo2 = []
for (const e of estornos) {
  const pago = reembolsoDaDevolucao(e)
  const aberto = aPagarDoEstorno(e)
  if (pago && aberto && aberto.status !== 'pago') grupo1.push({ e, pago, aberto })
  if (pago && saldo(e.pessoa_id) > Number(e.valor || 0) - 0.011) grupo2.push({ e, pago, saldo: saldo(e.pessoa_id) })
}

const pendentes = lanc.filter((l) => l.categoria === 'Estorno de crédito' && l.status === 'pendente' &&
  (l.data_vencimento ?? '') >= de && (l.data_vencimento ?? '') < ate)

console.log(`\nConferência de estornos de crédito — ${mes}\n`)
console.log(`estornos no período: ${estornos.length}`)

console.log(`\n🔴 1) Estorno com "a pagar" aberto E reembolso já pago: ${grupo1.length}`)
for (const g of grupo1) console.log(`   ${dia(g.e.created_at)} ${brl(g.e.valor).padStart(9)} ${(g.e.pessoa_nome || '-').slice(0, 30)} — pago em ${dia(g.pago.data_pagamento)} (${g.pago.descricao?.slice(0, 34)}), a pagar ${g.aberto.status}`)

console.log(`\n🔴 2) Crédito estornado que ainda está no saldo do cliente: ${grupo2.length} · R$ ${brl(grupo2.reduce((t, g) => t + Number(g.e.valor || 0), 0))}`)
for (const g of grupo2) console.log(`   ${dia(g.e.created_at)} ${brl(g.e.valor).padStart(9)} ${(g.e.pessoa_nome || '-').slice(0, 30)} — saldo hoje ${brl(g.saldo)} (reembolso pago em ${dia(g.pago.data_pagamento)})`)

console.log(`\n🟡 3) "Estorno de crédito" pendente no mês: ${pendentes.length} · R$ ${brl(pendentes.reduce((t, l) => t + Number(l.valor || 0), 0))}`)
for (const l of pendentes) console.log(`   ${dia(l.data_vencimento)} ${brl(l.valor).padStart(9)} ${(l.pessoa_nome || '-').slice(0, 30)} — ${l.descricao?.slice(0, 46)}`)

// 4) ESTORNO FEITO FORA DA TELA — o defeito que apareceu em 23/11 e é o mais perigoso.
// O saldo do vale é lido POR LOJA (é o limite que o PDV aplica). Estorno gravado sem
// `loja_id` cai num balde "(sem loja)" e o crédito continua inteiro na loja dele: o PDV
// passa a oferecer ao cliente um vale que ele não tem mais (RODRIGO PEREIRA aparecia com
// R$ 1.025,50 de saldo quando o real era R$ 25,50; LUIZ CARLOS SANTANA com 67,00 e
// DENILSON PEÇAS com 45,00 quando o real era zero). A tela grava pelo RPC
// `estornar_credito_cliente`, que copia a loja do crédito, liga o `estorna_credito_id` e
// recusa estorno que deixaria saldo negativo — quem faz por SQL pula as três travas.
const semLoja = estornos.filter((e) => !e.loja_id || !e.estorna_credito_id)
console.log(`\n🔴 4) Estorno gravado fora da tela (sem loja ou sem vínculo com o crédito): ${semLoja.length}`)
for (const e of semLoja) console.log(`   ${dia(e.created_at)} ${brl(e.valor).padStart(9)} ${(e.pessoa_nome || '-').slice(0, 30)} — loja=${e.loja_id ? 'ok' : 'FALTA'} · vínculo=${e.estorna_credito_id ? 'ok' : 'FALTA'} · ${String(e.descricao ?? '').slice(0, 40)}`)
if (semLoja.length) console.log('   → conserta com `node scripts/consertar-estornos-sem-loja.mjs --gravar` (ensaio sem --gravar)')

// 5) CRÉDITO ESTORNADO DEPOIS DE GASTO — saldo negativo. Aqui não é bug de tela: o
// cliente usou o crédito e depois o crédito foi cancelado, então ele deve a diferença.
const negativos = []
const porPessoa = new Map()
for (const c of creditos) {
  const k = c.pessoa_id ?? 'sem'
  porPessoa.set(k, (porPessoa.get(k) ?? 0) + (['uso', 'estorno'].includes(c.tipo) ? -Number(c.valor || 0) : Number(c.valor || 0)))
}
for (const [pid, v] of porPessoa) {
  if (v < -0.01) {
    const nome = creditos.find((c) => c.pessoa_id === pid)?.pessoa_nome ?? pid
    negativos.push({ pid, nome, v })
  }
}
// saldo POR LOJA é o que o PDV aplica na venda: se ele estiver maior que o saldo da
// pessoa, o cliente pode gastar crédito que não tem. É o defeito do estorno sem loja.
const porPessoaLoja = new Map()
for (const c of creditos) {
  const k = `${c.pessoa_id ?? 'sem'}|${c.loja_id ?? ''}`
  porPessoaLoja.set(k, (porPessoaLoja.get(k) ?? 0) + (['uso', 'estorno'].includes(c.tipo) ? -Number(c.valor || 0) : Number(c.valor || 0)))
}
const inflados = []
for (const [k, v] of porPessoaLoja) {
  if (v <= 0.01) continue
  const [pid] = k.split('|')
  const total = porPessoa.get(pid) ?? 0
  if (v - total > 0.01) inflados.push({ nome: creditos.find((c) => c.pessoa_id === pid)?.pessoa_nome ?? pid, loja: v, total })
}
console.log(`\n🟡 5) Cliente com saldo de vale NEGATIVO (crédito cancelado já gasto): ${negativos.length}`)
for (const n of negativos) console.log(`   ${(n.nome || '-').slice(0, 34).padEnd(34)} R$ ${brl(n.v)} — usou mais crédito do que tinha`)
console.log(`\n🔴 6) Saldo POR LOJA maior que o saldo real (vale a mais no PDV): ${inflados.length}`)
for (const i of inflados) console.log(`   ${(i.nome || '-').slice(0, 34).padEnd(34)} loja R$ ${brl(i.loja)} × real R$ ${brl(i.total)}`)

const problemas = grupo1.length + grupo2.length + pendentes.length + semLoja.length + inflados.length
if (problemas) console.log(`\n${problemas} ponto(s) para olhar antes de fechar o mês.`)
else console.log('\nnada a apontar — estorno e reembolso combinando.')
if (negativos.length) console.log(`⚠ atenção: ${negativos.length} cliente(s) com saldo negativo (usou mais crédito do que tinha) — é dívida do cliente, não dinheiro solto na loja.`)
