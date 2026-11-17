#!/usr/bin/env node
// DIAGNÓSTICO DA CONTA DE UM FORNECEDOR — só lê. Nada é gravado, nada é corrigido.
//
// Responde "por que o número do app não bate com a minha planilha":
//   1. todos os lançamentos a pagar do fornecedor (por id de cadastro E por nome gravado);
//   2. total por loja, por status, e o resto (valor - valor_pago);
//   3. o histórico de pagamentos linha por linha (é ele que explica "já pago");
//   4. as notas de entrada do fornecedor e quanto delas virou conta a pagar;
//   5. linhas suspeitas: valor_pago diferente da soma do histórico, pago a mais,
//      duplicata (mesmo fornecedor + mesmo valor + mesmo dia) e lançamento sem loja.
//
// Uso:
//   node scripts/diagnostico-fornecedor.mjs ADL H2O
//   node scripts/diagnostico-fornecedor.mjs "h2o"

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const n2 = (v) => Math.round(Number(v || 0) * 100) / 100

function env() {
  const arq = path.join(RAIZ, '.env.local')
  if (!fs.existsSync(arq)) { console.error('Sem .env.local neste PC — rode no PC da loja.'); process.exit(1) }
  const txt = fs.readFileSync(arq, 'utf8')
  const get = (k) => { const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
  return { url: get('NEXT_PUBLIC_SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') }
}

async function tudo(sb, tabela, sel, montar) {
  const out = []
  for (let from = 0; from < 400000; from += 1000) {
    const { data, error } = await montar(sb.from(tabela).select(sel).range(from, from + 999))
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data || !data.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const termos = process.argv.slice(2).filter((a) => !a.startsWith('-'))
if (!termos.length) {
  console.error('Diga o fornecedor: node scripts/diagnostico-fornecedor.mjs ADL H2O')
  process.exit(1)
}

const { url, key } = env()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: lojas } = await sb.from('lojas').select('id, nome')
const nomeLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]))
const { data: pessoas } = await sb.from('pessoas').select('id, nome, tipo, ativo')

const achados = []
for (const termo of termos) {
  const t = termo.toLowerCase()
  const casam = (pessoas ?? []).filter((p) => String(p.nome ?? '').toLowerCase().includes(t))
  achados.push({ termo, casam })
}

for (const { termo, casam } of achados) {
  console.log('\n' + '='.repeat(72))
  console.log(`FORNECEDOR "${termo}" — cadastros que casam: ${casam.length}`)
  console.log('='.repeat(72))
  for (const p of casam) console.log(`  · ${p.nome} (${p.tipo}${p.ativo === false ? ', INATIVO' : ''}) id ${p.id}`)
  if (!casam.length) continue

  const ids = casam.map((p) => p.id)
  const nomes = casam.map((p) => String(p.nome))

  const linhas = await tudo(sb, 'lancamentos',
    'id, descricao, valor, valor_pago, status, tipo, data_competencia, data_vencimento, data_pagamento, historico_pagamentos, pessoa_nome, pessoa_id, loja_id, categoria, created_at, updated_at',
    (q) => q.eq('tipo', 'pagar').in('pessoa_id', ids).order('data_competencia', { ascending: true }))

  // lançamento antigo pode ter só o nome gravado (sem pessoa_id) — a planilha do
  // dono soma os dois, então a conferência também soma os dois.
  const orfaos = (await tudo(sb, 'lancamentos',
    'id, descricao, valor, valor_pago, status, tipo, data_competencia, data_vencimento, data_pagamento, historico_pagamentos, pessoa_nome, pessoa_id, loja_id, categoria, created_at, updated_at',
    (q) => q.eq('tipo', 'pagar').is('pessoa_id', null).order('data_competencia', { ascending: true })))
    .filter((l) => nomes.some((nm) => String(l.pessoa_nome ?? '').toLowerCase().includes(nm.toLowerCase().split(' ')[0])))

  const todas = [...linhas, ...orfaos.filter((o) => !linhas.some((l) => l.id === o.id))]
    .sort((a, b) => String(a.data_competencia ?? '').localeCompare(String(b.data_competencia ?? '')))

  const pend = todas.filter((l) => l.status === 'pendente')
  const somaValor = n2(todas.reduce((s, l) => s + Number(l.valor ?? 0), 0))
  const somaPago = n2(todas.reduce((s, l) => s + Number(l.valor_pago ?? 0), 0))
  const restante = n2(pend.reduce((s, l) => s + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0))

  console.log(`\nLANÇAMENTOS A PAGAR: ${todas.length} linha(s)${orfaos.length ? ` (${orfaos.length} sem pessoa_id, casadas pelo nome)` : ''}`)
  console.log(`  A Pagar pendente (soma do que falta): ${brl(restante)}`)
  console.log(`  Já pago (soma de valor_pago):         ${brl(somaPago)}`)
  console.log(`  Valor total das notas lançadas:       ${brl(somaValor)}`)

  const porStatus = {}
  for (const l of todas) {
    const k = l.status ?? '(sem status)'
    porStatus[k] = porStatus[k] ?? { n: 0, valor: 0, pago: 0, falta: 0 }
    porStatus[k].n++
    porStatus[k].valor = n2(porStatus[k].valor + Number(l.valor ?? 0))
    porStatus[k].pago = n2(porStatus[k].pago + Number(l.valor_pago ?? 0))
    porStatus[k].falta = n2(porStatus[k].falta + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)))
  }
  console.log('\n  por status:')
  for (const [k, v] of Object.entries(porStatus)) {
    console.log(`    ${k.padEnd(12)} ${String(v.n).padStart(3)} linha(s) · valor ${brl(v.valor)} · pago ${brl(v.pago)} · falta ${brl(v.falta)}`)
  }

  const porLoja = {}
  for (const l of pend) {
    const k = l.loja_id ? (nomeLoja.get(l.loja_id) ?? 'loja fora do cadastro') : 'SEM LOJA'
    porLoja[k] = porLoja[k] ?? { n: 0, falta: 0 }
    porLoja[k].n++
    porLoja[k].falta = n2(porLoja[k].falta + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)))
  }
  console.log('\n  pendente por loja:')
  for (const [k, v] of Object.entries(porLoja)) console.log(`    ${k.padEnd(22)} ${String(v.n).padStart(3)} linha(s) · falta ${brl(v.falta)}`)

  // ---------- linha por linha ----------
  console.log('\n  LINHAS (competência · descrição · valor · pago · falta · status · loja)')
  for (const l of todas) {
    const falta = Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0))
    const hist = Array.isArray(l.historico_pagamentos) ? l.historico_pagamentos : []
    const somaHist = n2(hist.reduce((s, h) => s + Number(h?.valor ?? 0), 0))
    const alerta = []
    if (hist.length && Math.abs(somaHist - Number(l.valor_pago ?? 0)) > 0.009) alerta.push(`histórico ${brl(somaHist)} ≠ pago ${brl(l.valor_pago)}`)
    if (Number(l.valor_pago ?? 0) - Number(l.valor ?? 0) > 0.009) alerta.push('PAGO A MAIS')
    if (!l.loja_id) alerta.push('sem loja')
    console.log(`    ${dia(l.data_competencia)} · ${String(l.descricao ?? '').slice(0, 52).padEnd(52)} · ${brl(l.valor).padStart(12)} · ${brl(l.valor_pago).padStart(12)} · ${brl(falta).padStart(11)} · ${String(l.status ?? '-').padEnd(10)} · ${l.loja_id ? (nomeLoja.get(l.loja_id) ?? '?') : 'SEM LOJA'}${alerta.length ? '   ⚠ ' + alerta.join(' · ') : ''}`)
  }

  // ---------- duplicatas prováveis ----------
  const chaves = new Map()
  for (const l of todas) {
    const k = `${dia(l.data_competencia)}|${n2(l.valor)}|${String(l.descricao ?? '').trim().toLowerCase()}`
    chaves.set(k, [...(chaves.get(k) ?? []), l])
  }
  const dups = [...chaves.values()].filter((g) => g.length > 1)
  console.log(`\n  DUPLICATAS prováveis (mesmo dia + mesmo valor + mesma descrição): ${dups.length}`)
  for (const g of dups) {
    console.log(`    ${dia(g[0].data_competencia)} · ${brl(g[0].valor)} · "${String(g[0].descricao ?? '').slice(0, 50)}" · ${g.length}x`)
    for (const l of g) console.log(`       id ${l.id} · pago ${brl(l.valor_pago)} · ${l.status}`)
  }

  // ---------- notas de entrada ----------
  const notas = await tudo(sb, 'notas_entrada', 'id, numero, data_entrada, data_emissao, valor_total, status, observacoes',
    (q) => q.in('fornecedor_id', ids).order('data_entrada', { ascending: true }))
  const somaNotas = n2(notas.reduce((s, n) => s + Number(n.valor_total ?? 0), 0))
  console.log(`\n  NOTAS DE ENTRADA do cadastro: ${notas.length} · soma ${brl(somaNotas)}`)
  for (const n of notas) console.log(`    #${n.numero ?? '-'} · entrada ${dia(n.data_entrada)} · emissão ${dia(n.data_emissao)} · ${brl(n.valor_total)} · ${n.status}`)
  console.log(`\n  >>> DIFERENÇA (notas ${brl(somaNotas)} - contas a pagar ${brl(somaValor)}) = ${brl(n2(somaNotas - somaValor))}`)
}
