// SÓ LEITURA — venda 14867 (DAVID DOS SANTOS MORTES): como foi registrada, o que entrou
// de dinheiro e como está o saldo de vale-crédito dele.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (x) => (x ?? '').slice(0, 19).replace('T', ' ')

const numero = Number(process.argv[2] ?? 14867)
const { data: v } = await s.from('vendas').select('*').eq('numero', numero).maybeSingle()
if (!v) { console.log('venda não encontrada:', numero); process.exit(1) }
console.log(`\n=== VENDA #${v.numero} (${v.id}) ===`)
console.log(`  ${dia(v.created_at)} · total R$ ${brl(v.total)} · desconto ${brl(v.desconto)} · status ${v.status} · cancelada=${v.cancelada ?? '-'} · uso_interno=${v.uso_interno}`)
console.log(`  cliente: ${v.cliente_nome ?? '-'} (pessoa_id ${v.pessoa_id ?? '-'}) · vendedor_id ${v.vendedor_id ?? '-'} · caixa ${v.caixa_id ?? '-'} · forma_pagamento_id ${v.forma_pagamento_id ?? '-'}`)

const { data: itens } = await s.from('itens_venda').select('produto_id, quantidade, preco_unitario, desconto_item, total_item, nome').eq('venda_id', v.id)
console.log('\n  ITENS:')
for (const i of itens ?? []) console.log(`    ${i.quantidade} × ${i.nome ?? i.produto_id} · unit R$ ${brl(i.preco_unitario)} · total R$ ${brl(i.total_item)}`)

const { data: pags } = await s.from('pagamentos_venda').select('id, forma_pagamento_id, valor, taxa, status, created_at').eq('venda_id', v.id).order('created_at')
console.log('\n  PAGAMENTOS:')
for (const p of pags ?? []) console.log(`    ${dia(p.created_at)} forma ${p.forma_pagamento_id} · R$ ${brl(p.valor)} · taxa ${brl(p.taxa)} · ${p.status}`)
const { data: formas } = await s.from('formas_pagamento').select('id, nome, tipo')
const nomeForma = new Map((formas ?? []).map((f) => [f.id, `${f.nome} (${f.tipo})`]))
for (const p of pags ?? []) console.log(`      → ${nomeForma.get(p.forma_pagamento_id) ?? p.forma_pagamento_id}`)

const { data: lanc } = await s.from('lancamentos').select('id, tipo, descricao, valor, valor_pago, status, categoria, forma_pagamento, data_vencimento, data_pagamento, conta_id, pessoa_nome').eq('venda_id', v.id)
console.log('\n  LANÇAMENTOS DA VENDA:')
for (const l of lanc ?? []) console.log(`    ${l.tipo} R$ ${brl(l.valor)} (pago ${brl(l.valor_pago)}) ${l.status} · ${l.categoria} · ${l.forma_pagamento ?? '-'} · ${l.descricao}`)

// caixa da venda
if (v.caixa_id) {
  const { data: cx } = await s.from('caixas').select('id, loja_id, status, valor_abertura, valor_fechamento, aberto_em, fechado_em').eq('id', v.caixa_id).maybeSingle()
  console.log(`\n  CAIXA DA VENDA: ${cx ? `${cx.status} · aberto ${dia(cx.aberto_em)} · fechado ${dia(cx.fechado_em)} · abertura ${brl(cx.valor_abertura)} · fechamento ${brl(cx.valor_fechamento)}` : 'não achei'}`)
  const { data: movs } = await s.from('movimentos_caixa').select('id, tipo, valor, forma_pagamento, motivo, created_at').eq('caixa_id', v.caixa_id).order('created_at')
  console.log('  movimentos do caixa (todos):')
  for (const m of movs ?? []) console.log(`    ${dia(m.created_at)} ${String(m.tipo).padEnd(12)} R$ ${brl(m.valor).padStart(9)} ${String(m.forma_pagamento).padEnd(10)} ${String(m.motivo ?? '').slice(0, 50)}`)
}

// créditos do cliente
if (v.pessoa_id) {
  const { data: pessoa } = await s.from('pessoas').select('id, nome').eq('id', v.pessoa_id).maybeSingle()
  console.log(`\n  CLIENTE: ${pessoa?.nome ?? v.pessoa_id}`)
  const { data: cr } = await s.from('creditos_clientes').select('id, tipo, valor, loja_id, descricao, created_at, venda_id').eq('pessoa_id', v.pessoa_id).order('created_at')
  let saldo = 0
  for (const c of cr ?? []) { const ef = ['uso', 'estorno'].includes(c.tipo) ? -Number(c.valor || 0) : Number(c.valor || 0); saldo += ef; console.log(`    ${dia(c.created_at)} ${String(c.tipo).padEnd(8)} ${brl(c.valor).padStart(9)} → ${brl(saldo).padStart(10)} ${String(c.descricao ?? '').slice(0, 44)}${c.venda_id === v.id ? '  ← ESTA VENDA' : ''}`) }
  console.log(`    saldo atual: R$ ${brl(saldo)}`)
}
console.log('')
