#!/usr/bin/env node
// CONFERIR A DÍVIDA COM OS FORNECEDORES — só lê. Nada é gravado.
//
// Existe porque o número do app e a planilha do dono divergem com frequência e a
// causa quase sempre é a MESMA família de problema: a mesma dívida contada de dois
// jeitos. Este script mostra os dois jeitos lado a lado, por fornecedor, e aponta
// a linha que faz a diferença.
//
// O que ele responde:
//  1. dívida por CADASTRO (pessoa_id) e por NOME gravado (pessoa_nome) — e a diferença;
//  2. quanto está pendente só no nome (linha invisível para as regras que usam id);
//  3. nota cujo valor não fecha com a nota de entrada (abatimento não registrado);
//  4. abatimento repetido no histórico (mesmo valor, mesma forma, mesmo dia);
//  5. "pagamento" gravado como conta a pagar pendente (dívida fantasma).
//
// Uso:
//   node scripts/conferir-divida-fornecedor.mjs              (todos os fornecedores)
//   node scripts/conferir-divida-fornecedor.mjs ADL H2O      (só esses)
//   node scripts/conferir-divida-fornecedor.mjs --mes 2026-11

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n2 = (v) => Math.round(Number(v || 0) * 100) / 100
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

const args = process.argv.slice(2)
const iMes = args.indexOf('--mes')
const MES = iMes >= 0 ? args[iMes + 1] : null
const termos = args.filter((a, i) => !a.startsWith('--') && (iMes < 0 || i !== iMes + 1)).map((a) => a.toLowerCase())

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

const { url, key } = env()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: lojas } = await sb.from('lojas').select('id, nome')
const nomeLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]))
const { data: pessoasTodas } = await sb.from('pessoas').select('id, nome, tipo, ativo')
const fornecedores = (pessoasTodas ?? []).filter((p) => ['fornecedor', 'ambos'].includes(String(p.tipo)))
const alvo = termos.length
  ? fornecedores.filter((f) => termos.some((t) => String(f.nome).toLowerCase().includes(t)))
  : fornecedores

const linhas = await tudo(sb, 'lancamentos',
  'id, descricao, valor, valor_pago, status, tipo, categoria, pessoa_nome, pessoa_id, loja_id, data_competencia, data_vencimento, data_pagamento, historico_pagamentos, created_at',
  (q) => q.eq('tipo', 'pagar').order('data_competencia'))

const notas = await tudo(sb, 'notas_entrada', 'id, numero, fornecedor_id, valor_total, data_entrada, status', (q) => q.order('data_entrada'))
const notaPorNumero = new Map(notas.map((n) => [String(n.numero ?? ''), n]))

const noMes = (r) => !MES || String(r.data_competencia ?? '').slice(0, 7) === MES
// Sem `Math.max(0, …)`: linha de crédito (valor negativo, criada quando o abatimento é
// maior que a dívida) DIMINUI o total. Zerar o negativo inflava o número e escondeu
// R$ 37,82 na H2O em 17/11/2026.
const pendente = (r) => r.status === 'pendente' ? Number(r.valor ?? 0) - Number(r.valor_pago ?? 0) : 0

console.log(`\nDÍVIDA COM FORNECEDORES — ${MES ? 'competência ' + MES : 'tudo'}${termos.length ? ' — ' + termos.join(', ') : ''}`)
console.log('(coluna "por ID" = regras do app; "por NOME" = o que a tela mostra ao buscar o fornecedor)\n')
console.log('| fornecedor | por ID | por NOME | diferença | pendente sem cadastro |')
console.log('|---|---|---|---|---|')

const problemas = []
const servicos = []   // conta de serviço fixo sem cadastro: informa, não acusa
for (const f of alvo) {
  const nome = String(f.nome)
  const porId = linhas.filter((l) => l.pessoa_id === f.id && noMes(l))
  const porNome = linhas.filter((l) => !l.pessoa_id && String(l.pessoa_nome ?? '').trim().toUpperCase() === nome.trim().toUpperCase() && noMes(l))
  const dId = n2(porId.reduce((s, l) => s + pendente(l), 0))
  const dNome = n2(porNome.reduce((s, l) => s + pendente(l), 0))
  if (!dId && !dNome) continue
  console.log(`| ${nome} | ${brl(dId)} | ${brl(dId + dNome)} | ${brl(dNome)} | ${porNome.length} linha(s) |`)
  // Só mercadoria conta como "pendente sem cadastro": conta de SERVIÇO fixo
  // (advocacia mensal, contabilidade) não é dívida de mercadoria, e acusá-la aqui
  // virava alarme falso — o tipo de erro que ensina a ignorar o conferente.
  for (const l of porNome.filter((l) => pendente(l) > 0 && /mercadoria/i.test(String(l.categoria ?? '')))) {
    problemas.push({ tipo: 'PENDENTE SEM CADASTRO', fornecedor: nome, linha: l })
  }
  for (const l of porNome.filter((l) => pendente(l) > 0 && !/mercadoria/i.test(String(l.categoria ?? '')))) {
    servicos.push({ fornecedor: nome, linha: l })
  }
}

// ---------- 2) pagamento gravado como dívida ----------
// Duas condições, as duas aprendidas na prática:
//  - valor POSITIVO: o app grava "Crédito de pagamento — PAGAMENTO DE MERCADORIA"
//    com valor NEGATIVO de propósito, e essa linha DIMINUI o total;
//  - descrição que COMEÇA com "Pagamento" (título de pagamento), não que apenas
//    cite a palavra: "COMPRA MERCADORIA - NOTA 137 (abateu 2542,00 de pagamento)"
//    é compra normal e era acusada por causa do parêntese.
// Regra de auditoria não pode acusar a convenção do app.
const ehTituloDePagamento = (d) => /^\s*pagamento\b/i.test(String(d ?? ''))
for (const l of linhas.filter((l) => l.status === 'pendente' && Number(l.valor) > 0 && ehTituloDePagamento(l.descricao) && noMes(l))) {
  problemas.push({ tipo: 'PAGAMENTO VIRou DÍVIDA', fornecedor: l.pessoa_nome ?? '(sem fornecedor)', linha: l })
}

// ---------- 3) nota que não fecha com a nota de entrada ----------
// Linha com valor ZERO foi zerada pelo abatimento — convenção do app, não erro.
// Comparar a nota com uma conta zerada acusa 100% das notas abatidas (eram 7
// alarmes falsos em 25/11/2026, todos com "conta R$ 0,00").
for (const l of linhas.filter((l) => /COMPRA MERCADORIA/i.test(String(l.descricao ?? '')) && Number(l.valor ?? 0) !== 0 && noMes(l))) {
  const m = String(l.descricao ?? '').match(/NOTA\s+(\S+)/i)
  if (!m) continue
  const nota = notaPorNumero.get(m[1])
  if (!nota) continue
  const hist = Array.isArray(l.historico_pagamentos) ? l.historico_pagamentos.reduce((s, h) => s + Number(h?.valor ?? 0), 0) : 0
  const soma = n2(Number(l.valor ?? 0) + hist)
  const dif = n2(Number(nota.valor_total ?? 0) - soma)
  if (Math.abs(dif) > 0.009) {
    problemas.push({
      tipo: 'NOTA NÃO FECHA',
      fornecedor: l.pessoa_nome ?? '(sem fornecedor)',
      detalhe: `nota #${m[1]} entrada ${brl(nota.valor_total)} × conta ${brl(l.valor)} + histórico ${brl(hist)} = ${brl(soma)} · diferença ${brl(dif)} (abatimento aplicado no valor mas fora do histórico)`,
    })
  }
}

// ---------- 4) abatimento repetido ----------
for (const l of linhas) {
  const hist = Array.isArray(l.historico_pagamentos) ? l.historico_pagamentos : []
  const vistos = new Map()
  for (const h of hist) {
    const k = `${h?.valor}|${h?.forma}|${String(h?.data).slice(0, 10)}`
    vistos.set(k, (vistos.get(k) ?? 0) + 1)
  }
  for (const [k, n] of vistos) if (n > 1) problemas.push({ tipo: 'ABATIMENTO REPETIDO', fornecedor: l.pessoa_nome ?? '?', detalhe: `${n}x no histórico: ${k.replace(/\|/g, ' · ')} · "${String(l.descricao ?? '').slice(0, 45)}"` })
}

console.log(`\nPROBLEMAS ENCONTRADOS: ${problemas.length}`)
for (const p of problemas) {
  if (p.linha) {
    const l = p.linha
    console.log(`\n[${p.tipo}] ${p.fornecedor} · ${brl(l.valor)} · competência ${dia(l.data_competencia)} · ${l.loja_id ? nomeLoja.get(l.loja_id) : 'SEM LOJA'}`)
    console.log(`   "${String(l.descricao ?? '').slice(0, 90)}"`)
    console.log(`   id ${l.id} · categoria ${l.categoria ?? '-'} · criado ${dia(l.created_at)}`)
  } else {
    console.log(`\n[${p.tipo}] ${p.fornecedor}`)
    console.log(`   ${p.detalhe}`)
  }
}

// Serviço fixo (advocacia, contabilidade) sem cadastro não entra como problema:
// não é dívida de mercadoria. Fica listado à parte para não sumir do radar.
if (servicos.length) {
  console.log(`\nFORA DA CONTA DE MERCADORIA — ${servicos.length} linha(s) de serviço sem cadastro:`)
  for (const s of servicos) {
    console.log(`  ${s.fornecedor} · ${brl(s.linha.valor)} · categoria ${s.linha.categoria ?? '-'} · "${String(s.linha.descricao ?? '').slice(0, 50)}"`)
  }
}
