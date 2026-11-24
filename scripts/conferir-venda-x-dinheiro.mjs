// SÓ LEITURA — A CONFERÊNCIA SIMPLES, do jeito que fecha.
//
// Pedido do dono: "somar o que realmente entrou de dinheiro com as vendas concluídas".
// A ideia tem um furo: venda concluída não é dinheiro que entrou. Venda no fiado é venda
// SEM dinheiro, e fiado recebido de venda antiga é dinheiro SEM venda nova. Somar os dois
// conta o mesmo real duas vezes (na primeira versão deste script deu R$ 193 mil de
// diferença só por isso).
//
// A régua que fecha, e que qualquer pessoa entende:
//
//   1º) VENDA = soma dos pagamentos da venda (todos, inclusive "fiado").
//       Venda concluída tem que estar inteiramente paga no ato ou no fiado.
//   2º) Dessa venda, separar o que virou DINHEIRO (gaveta/banco/maquininha) do que virou
//       PROMESSA (fiado).
//   3º) O dinheiro que entra no mês = o dinheiro das vendas do mês + o fiado que os
//       clientes vieram pagar (venda antiga), menos o que saiu (devolução e despesa).
//
// Uso: node scripts/conferir-venda-x-dinheiro.mjs 2026-11
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const P = 1000
async function tudo(q) { const o = []; for (let i = 0; i < 400000; i += P) { const { data, error } = await q(i, i + P - 1); if (error) throw new Error(error.message); if (!data?.length) break; o.push(...data); if (data.length < P) break } return o }
async function tudoIn(ids, make, chunk = 200) { const o = []; for (let i = 0; i < ids.length; i += chunk) { const c = ids.slice(i, i + chunk); o.push(...await tudo((a, b) => make(c, a, b))) } return o }

const mes = process.argv[2] ?? '2026-11'
const [ano, m] = mes.split('-').map(Number)
const de = `${mes}-01`
const ate = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
const inicio = de + 'T00:00:00-03:00'
const fim = ate + 'T00:00:00-03:00'

const { data: formas } = await s.from('formas_pagamento').select('id, nome, tipo')
const formaDe = new Map((formas ?? []).map((f) => [f.id, f]))
const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')

let somaGeral = { venda: 0, pago: 0, dinheiro: 0, promessa: 0, recebido: 0, saiu: 0 }

for (const loja of lojas ?? []) {
  const { data: cxs } = await s.from('caixas').select('id').eq('loja_id', loja.id)
  const caixas = (cxs ?? []).map((c) => c.id)

  // 1) vendas concluídas e os pagamentos delas
  const vendas = await tudo((f, t) => s.from('vendas').select('id, total, caixa_id').eq('status', 'concluida').eq('uso_interno', false)
    .gte('created_at', inicio).lt('created_at', fim).order('id').range(f, t))
  const vs = vendas.filter((v) => v.caixa_id && caixas.includes(v.caixa_id))
  const totalVenda = vs.reduce((t, v) => t + Number(v.total ?? 0), 0)
  const ids = vs.map((v) => v.id)
  const pags = ids.length ? await tudoIn(ids, (chunk, a, b) => s.from('pagamentos_venda')
    .select('venda_id, forma_pagamento_id, valor').in('venda_id', chunk).order('id').range(a, b)) : []
  const porTipo = {}
  for (const p of pags) {
    const tipo = (formaDe.get(p.forma_pagamento_id)?.tipo ?? 'outro')
    porTipo[tipo] = (porTipo[tipo] ?? 0) + Number(p.valor ?? 0)
  }
  const totalPago = Object.values(porTipo).reduce((a, b) => a + b, 0)
  const promessa = (porTipo['fiado'] ?? 0)
  const dinheiroDaVenda = totalPago - promessa - (porTipo['vale_credito'] ?? 0)
  const valeUsado = (porTipo['vale_credito'] ?? 0)

  // 2) dinheiro que entrou fora da venda nova (fiado de venda antiga, sinal)
  const movs = await tudo((f, t) => s.from('movimentos_caixa').select('tipo, valor, forma_pagamento')
    .in('caixa_id', caixas).gte('created_at', inicio).lt('created_at', fim).order('id').range(f, t))
  const recebido = movs.filter((x) => x.tipo === 'recebimento').reduce((t, x) => t + Number(x.valor ?? 0), 0)
  const reforco = movs.filter((x) => x.tipo === 'reforco').reduce((t, x) => t + Number(x.valor ?? 0), 0)
  const retirada = movs.filter((x) => x.tipo === 'retirada').reduce((t, x) => t + Number(x.valor ?? 0), 0)
  const devCaixa = movs.filter((x) => x.tipo === 'devolucao').reduce((t, x) => t + Number(x.valor ?? 0), 0)

  // 3) o que saiu: devolução ao cliente e despesas pagas no mês
  const lancs = await tudo((f, t) => s.from('lancamentos').select('valor, valor_pago, tipo, categoria')
    .eq('status', 'pago').gte('data_pagamento', inicio).lt('data_pagamento', fim).eq('loja_id', loja.id).order('id').range(f, t))
  const devolvidoCliente = lancs.filter((l) => l.tipo === 'pagar' && /devolu/i.test(l.categoria ?? '')).reduce((t, l) => t + Number(l.valor_pago ?? l.valor ?? 0), 0)
  const despesasPagas = lancs.filter((l) => l.tipo === 'pagar' && !/devolu|mercadoria/i.test(l.categoria ?? '')).reduce((t, l) => t + Number(l.valor_pago ?? l.valor ?? 0), 0)
  const saiu = devolvidoCliente + despesasPagas

  console.log(`\n=== ${loja.nome} · ${mes} ===`)
  console.log(`  1) VENDA do mês (vendas concluídas) ......... R$ ${brl(totalVenda).padStart(12)}`)
  console.log(`     pagamentos dessas vendas ................. R$ ${brl(totalPago).padStart(12)}   ${Math.abs(totalVenda - totalPago) < 1 ? '✔ a venda fecha' : `← diferença ${brl(totalVenda - totalPago)}`}`)
  console.log(`       · virou dinheiro/gaveta/banco/máquina .. R$ ${brl(dinheiroDaVenda).padStart(12)}`)
  console.log(`       · virou fiado (promessa) ............... R$ ${brl(promessa).padStart(12)}`)
  console.log(`       · pago com vale-crédito ................ R$ ${brl(valeUsado).padStart(12)}`)
  console.log(`\n  2) DINHEIRO QUE ENTROU sem ser venda nova`)
  console.log(`       fiado que os clientes vieram pagar ..... R$ ${brl(recebido).padStart(12)}`)
  console.log(`       reforço ................................ R$ ${brl(reforco).padStart(12)}`)
  console.log(`       (−) retiradas .......................... -R$ ${brl(retirada).padStart(11)}`)
  console.log(`       (−) devolução em dinheiro .............. -R$ ${brl(devCaixa).padStart(11)}`)
  console.log(`\n  3) O QUE SAIU`)
  console.log(`       devolução ao cliente (paga) ............ -R$ ${brl(devolvidoCliente).padStart(11)}`)
  console.log(`       despesas pagas (sem mercadoria) ........  -R$ ${brl(despesasPagas).padStart(11)}`)
  console.log(`\n  CONTA DE BOLSO = (dinheiro da venda + fiado recebido + reforço − retirada − devolução em dinheiro − devolução paga − despesas)`)
  console.log(`         R$ ${brl(dinheiroDaVenda + recebido + reforco - retirada - devCaixa - devolvidoCliente - despesasPagas)}`)

  somaGeral.venda += totalVenda
  somaGeral.pago += totalPago
  somaGeral.dinheiro += dinheiroDaVenda
  somaGeral.promessa += promessa
  somaGeral.recebido += recebido
  somaGeral.saiu += saiu
}

console.log(`\n=== AS DUAS LOJAS ===`)
console.log(`  venda do mês .......... R$ ${brl(somaGeral.venda)}`)
console.log(`  dos quais dinheiro .... R$ ${brl(somaGeral.dinheiro)}`)
console.log(`  dos quais fiado ....... R$ ${brl(somaGeral.promessa)}`)
console.log(`  fiado recebido no mês . R$ ${brl(somaGeral.recebido)}`)
console.log(`  saiu (devolução+conta)  R$ ${brl(somaGeral.saiu)}`)
