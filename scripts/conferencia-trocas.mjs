#!/usr/bin/env node
// CONFERÊNCIA DE TROCAS COM FORNECEDOR — só lê. Nada é gravado.
//
// Regras que confere:
//  1. quanto está fora do estoque (peças com o fornecedor), por loja e por fornecedor;
//  2. peça parada há mais de N dias (padrão 30) — fila de cobrança;
//  3. peça sem fornecedor definido (não dá para cobrar);
//  4. troca marcada como "voltou" QUE NÃO TEM entrada no estoque (dinheiro fantasma);
//  5. troca enviada e nunca devolvida;
//  6. perdas registradas e valor abatido na dívida.
//
// Uso:
//   node scripts/conferencia-trocas.mjs
//   node scripts/conferencia-trocas.mjs 60      (muda o limite de dias)

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const dias = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

function env() {
  const arq = path.join(RAIZ, '.env.local')
  if (!fs.existsSync(arq)) { console.error('Sem .env.local neste PC — rode no PC da loja.'); process.exit(1) }
  const txt = fs.readFileSync(arq, 'utf8')
  const get = (k) => { const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
  return { url: get('NEXT_PUBLIC_SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') }
}

async function tudo(sb, tabela, sel, montar) {
  const out = []
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await montar(sb.from(tabela).select(sel).range(from, from + 999))
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data || !data.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const LIMITE = Math.max(1, parseInt(process.argv[2] ?? '30', 10) || 30)

;(async () => {
  const e = env()
  const sb = createClient(e.url, e.key, { auth: { persistSession: false } })

  const trocas = await tudo(sb, 'trocas', '*', (q) => q.order('data_saida'))
  const lojas = await tudo(sb, 'lojas', 'id, nome', (q) => q.order('id'))
  const nomeLoja = new Map(lojas.map((l) => [l.id, l.nome]))
  const deps = await tudo(sb, 'depositos', 'id, nome, loja_id', (q) => q.order('id'))
  const depEstoquePet = deps.find((d) => /PETR[ÓO]POLIS/i.test(d.nome) && /ESTOQUE/i.test(d.nome))
  const movs = await tudo(sb, 'movimentacoes_estoque', 'produto_id, deposito_id, operacao, quantidade, created_at', (q) => q.order('created_at'))

  const ativas = trocas.filter((t) => t.status === 'aberta' || t.status === 'enviada')
  const valor = (t) => Number(t.custo ?? 0) * Number(t.quantidade ?? 1)

  console.log('===== PEÇAS COM O FORNECEDOR =====')
  console.log(`  ${ativas.length} lançamento(s) · ${brl(ativas.reduce((s, t) => s + valor(t), 0))} a custo`)

  const porLoja = {}
  for (const t of ativas) {
    const k = t.loja_id ? (nomeLoja.get(t.loja_id) ?? t.loja_id) : '(sem loja)'
    const g = porLoja[k] ??= { n: 0, v: 0 }
    g.n += Number(t.quantidade ?? 1); g.v += valor(t)
  }
  for (const k of Object.keys(porLoja)) console.log(`    ${k}: ${porLoja[k].n} peça(s) · ${brl(porLoja[k].v)}`)

  const porForn = {}
  for (const t of ativas) {
    const k = t.fornecedor_nome || '(SEM FORNECEDOR DEFINIDO)'
    const g = porForn[k] ??= { n: 0, v: 0, maisAntiga: t.data_saida }
    g.n += Number(t.quantidade ?? 1); g.v += valor(t)
    if (String(t.data_saida) < String(g.maisAntiga)) g.maisAntiga = t.data_saida
  }
  console.log('\n  por fornecedor (fila de cobrança):')
  for (const [k, g] of Object.entries(porForn).sort((a, b) => b[1].v - a[1].v)) {
    console.log(`    ${k}: ${g.n} peça(s) · ${brl(g.v)} · a mais antiga há ${dias(g.maisAntiga)} dia(s) (${dia(g.maisAntiga)})`)
  }

  const velhas = ativas.filter((t) => dias(t.data_saida) > LIMITE)
  console.log(`\n===== PARADAS HÁ MAIS DE ${LIMITE} DIAS =====`)
  console.log(`  ${velhas.length} peça(s) · ${brl(velhas.reduce((s, t) => s + valor(t), 0))}`)
  for (const t of velhas.sort((a, b) => String(a.data_saida).localeCompare(String(b.data_saida))).slice(0, 20)) {
    console.log(`    ${dia(t.data_saida)} · ${dias(t.data_saida)}d · ${t.fornecedor_nome ?? 'SEM FORNECEDOR'} · ${t.produto_nome ?? t.produto_id}`)
  }

  const semForn = ativas.filter((t) => !t.fornecedor_nome)
  console.log(`\n===== SEM FORNECEDOR DEFINIDO =====`)
  console.log(`  ${semForn.length} peça(s) · ${brl(semForn.reduce((s, t) => s + valor(t), 0))} — não dá para cobrar`)

  // 4) troca marcada como voltou: tem entrada no estoque?
  const entradaPorProduto = new Map()
  for (const m of movs) {
    if (m.operacao !== 'entrada') continue
    const k = m.produto_id
    entradaPorProduto.set(k, [...(entradaPorProduto.get(k) ?? []), m])
  }
  const voltaram = trocas.filter((t) => t.status === 'retornou')
  const semEntrada = voltaram.filter((t) => {
    const lista = entradaPorProduto.get(t.produto_retorno_id ?? t.produto_id) ?? []
    return !lista.some((m) => t.data_retorno && Math.abs(new Date(m.created_at) - new Date(t.data_retorno)) < 6 * 3600 * 1000)
  })
  console.log('\n===== TROCAS QUE VOLTARAM =====')
  console.log(`  ${voltaram.length} · ${semEntrada.length} SEM entrada de estoque registrada perto do retorno`)
  for (const t of semEntrada) console.log(`    ${dia(t.data_retorno)} · ${t.produto_retorno_nome ?? t.produto_nome} · ${t.fornecedor_nome ?? '—'} — CONFERIR`)

  const foraDoFundo = voltaram.filter((t) => {
    const lista = entradaPorProduto.get(t.produto_retorno_id ?? t.produto_id) ?? []
    const perto = lista.filter((m) => t.data_retorno && Math.abs(new Date(m.created_at) - new Date(t.data_retorno)) < 6 * 3600 * 1000)
    return perto.length > 0 && !perto.some((m) => depEstoquePet && m.deposito_id === depEstoquePet.id)
  })
  console.log(`  ${foraDoFundo.length} entraram em depósito DIFERENTE do PETRÓPOLIS ESTOQUE (regra: sempre o fundo)`)
  for (const t of foraDoFundo) console.log(`    ${dia(t.data_retorno)} · ${t.produto_retorno_nome ?? t.produto_nome} — mover para PETRÓPOLIS ESTOQUE`)

  console.log('\n===== DINHEIRO FECHADO COM O FORNECEDOR =====')
  const perdidas = trocas.filter((t) => Number(t.perda ?? 0) > 0)
  const abatidas = trocas.filter((t) => t.valor_abatido != null)
  console.log(`  perdas registradas: ${perdidas.length} · ${brl(perdidas.reduce((s, t) => s + Number(t.perda ?? 0), 0))}`)
  console.log(`  abatidas na dívida: ${abatidas.length} · ${brl(abatidas.reduce((s, t) => s + Number(t.valor_abatido ?? 0), 0))}`)
  const semFecho = trocas.filter((t) => t.status === 'retornou' && Number(t.perda ?? 0) === 0 && t.valor_abatido == null)
  console.log(`  voltaram sem nenhum fechamento de valor: ${semFecho.length} (normal quando voltou a mesma peça)`)
})().catch((err) => { console.error('ERRO: ' + (err?.message || err)); process.exit(1) })
