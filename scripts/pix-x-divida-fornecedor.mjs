#!/usr/bin/env node
// PIX × DÍVIDA DO FORNECEDOR — só lê. Nada é gravado.
//
// A divergência mais comum entre o app e a planilha do dono é esta: o cliente
// pagou o fornecedor por PIX (dinheiro que saiu da conta do fornecedor, não da
// loja), o comprovante chegou no grupo do Telegram, mas a NOTA não encolheu.
// O dinheiro está registrado, a dívida continua igual — e o número do app fica
// maior do que a planilha.
//
// Este script soma, dia a dia, o PIX que foi para o fornecedor e o que o app
// registrou como abatimento/pagamento daquele fornecedor. O que sobra é dívida
// que o dinheiro já pagou.
//
// Uso:
//   node scripts/pix-x-divida-fornecedor.mjs H2O
//   node scripts/pix-x-divida-fornecedor.mjs ADL 2026-11-01 2026-11-17

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n2 = (v) => Math.round(Number(v || 0) * 100) / 100

function env() {
  const arq = path.join(RAIZ, '.env.local')
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

const args = process.argv.slice(2)
const termo = (args[0] ?? '').toUpperCase()
const DE = args[1] ?? '2026-11-01'
const ATE = args[2] ?? '2026-11-18'
if (!termo) { console.error('Uso: node scripts/pix-x-divida-fornecedor.mjs H2O [de] [ate]'); process.exit(1) }

const { url, key } = env()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: pessoas } = await sb.from('pessoas').select('id, nome').ilike('nome', `%${termo}%`)
const ids = (pessoas ?? []).map((p) => p.id)
const nomes = (pessoas ?? []).map((p) => String(p.nome).toUpperCase())
// nome curto que aparece no comprovante (H2O, ADL, ZL, INOVA, PLANETA)
const apelido = (n) => String(n).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)[0]

const { data: chaves } = await sb.from('pessoa_chaves_pix').select('pessoa_id, chave, favorecido').in('pessoa_id', ids)
const docs = (chaves ?? []).map((c) => String(c.chave ?? '').replace(/\D/g, '')).filter((d) => d.length >= 11)
const nomesChave = (chaves ?? []).map((c) => String(c.favorecido ?? '').toUpperCase()).filter(Boolean)

const norm = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

// 1) PIX que foram para esse fornecedor (cliente pagando ele)
const comps = await tudo(sb, 'comprovantes_pix',
  'id, valor, data_pix, destinatario, transacao_id, status, extraido_raw',
  (q) => q.gte('data_pix', DE).lt('data_pix', ATE).order('data_pix'))
const vistos = new Set()
const pixDia = {}
for (const c of comps) {
  if (['apagado', 'duplicado', 'furo'].includes(String(c.status))) continue
  if (c.extraido_raw?.eh_comprovante === false) continue
  const k = c.transacao_id || c.id
  if (vistos.has(k)) continue
  vistos.add(k)
  const alvoTexto = norm(c.destinatario)
  const doc = String(c.extraido_raw?.destinatario_doc ?? '').replace(/\D/g, '')
  const casa = (doc && docs.some((d) => d.startsWith(doc) || doc.startsWith(d))) ||
    nomes.some((n) => alvoTexto.includes(apelido(n)) || n.includes(alvoTexto.slice(0, 10))) ||
    nomesChave.some((n) => alvoTexto && n.includes(alvoTexto))
  if (!casa) continue
  pixDia[c.data_pix] = n2((pixDia[c.data_pix] ?? 0) + Number(c.valor ?? 0))
}

// 2) o que o app registrou: abatimentos (histórico) + pagamentos marcados pagos
const lanc = await tudo(sb, 'lancamentos',
  'id, descricao, valor, valor_pago, status, pessoa_nome, pessoa_id, data_competencia, data_pagamento, historico_pagamentos, categoria',
  (q) => q.eq('tipo', 'pagar'))
const doFornecedor = lanc.filter((l) => ids.includes(l.pessoa_id) || nomes.some((n) => String(l.pessoa_nome ?? '').toUpperCase().includes(apelido(n))))

const abatDia = {}
const soma = (obj, d, v) => { obj[d] = n2((obj[d] ?? 0) + Number(v ?? 0)) }
for (const l of doFornecedor) {
  for (const h of (Array.isArray(l.historico_pagamentos) ? l.historico_pagamentos : [])) {
    const d = String(h?.data ?? '').slice(0, 10)
    if (!d || d < DE || d >= ATE) continue
    soma(abatDia, d, h?.valor)
  }
  if (l.status === 'pago') {
    const d = String(l.data_pagamento ?? '').slice(0, 10)
    if (!d || d < DE || d >= ATE) continue
    // nota quitada por valor_pago antigo: entra como pagamento do dia
    soma(abatDia, d, Number(l.valor_pago ?? l.valor ?? 0))
  }
}

const dias = [...new Set([...Object.keys(pixDia), ...Object.keys(abatDia)])].sort()
const dbr = (d) => d.split('-').reverse().join('/')
console.log(`\nPIX para ${termo} × o que o app deu baixa — ${dbr(DE)} a ${dbr(ATE)}`)
console.log('(positivo na última coluna = dinheiro foi para o fornecedor e a dívida NÃO caiu)\n')
console.log('| dia | PIX ao fornecedor | baixado no app | diferença |')
console.log('|---|---|---|---|')
let tPix = 0, tAbat = 0
for (const d of dias) {
  const p = n2(pixDia[d] ?? 0)
  const a = n2(abatDia[d] ?? 0)
  tPix = n2(tPix + p)
  tAbat = n2(tAbat + a)
  const dif = n2(p - a)
  if (!p && !a) continue
  console.log(`| ${dbr(d)} | ${brl(p)} | ${brl(a)} | ${dif > 0 ? '**' + brl(dif) + '**' : brl(dif)} |`)
}
console.log(`| **total** | **${brl(tPix)}** | **${brl(tAbat)}** | **${brl(n2(tPix - tAbat))}** |`)
