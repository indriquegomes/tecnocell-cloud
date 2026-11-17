#!/usr/bin/env node
// Investiga linha por linha as contas a pagar PENDENTES de um fornecedor:
// quando nasceu, quem mexeu, o histórico de abatimentos e se o dinheiro
// (PIX/comprovante) já saiu em outro lançamento — só lê.
//
// Uso: node scripts/investigar-pendentes.mjs H2O

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

const arq = path.join(RAIZ, '.env.local')
const txt = fs.readFileSync(arq, 'utf8')
const get = (k) => { const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const termo = (process.argv[2] ?? '').toLowerCase()
const { data: pessoas } = await sb.from('pessoas').select('id, nome').ilike('nome', `%${termo}%`)
const ids = (pessoas ?? []).map((p) => p.id)
const nomes = (pessoas ?? []).map((p) => p.nome)
console.log('cadastros:', nomes.join(' · '))

const { data: lojas } = await sb.from('lojas').select('id, nome')
const nomeLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]))

const { data: pend } = await sb.from('lancamentos')
  .select('id, descricao, valor, valor_pago, categoria, pessoa_nome, pessoa_id, loja_id, data_competencia, data_vencimento, data_pagamento, historico_pagamentos, created_at, updated_at, forma_pagamento, status')
  .eq('tipo', 'pagar').eq('status', 'pendente').in('pessoa_id', ids).order('data_competencia')

const { data: pendNome } = await sb.from('lancamentos')
  .select('id, descricao, valor, valor_pago, categoria, pessoa_nome, pessoa_id, loja_id, data_competencia, data_vencimento, data_pagamento, historico_pagamentos, created_at, updated_at, forma_pagamento, status')
  .eq('tipo', 'pagar').eq('status', 'pendente').is('pessoa_id', null)

const linhas = [...(pend ?? []), ...(pendNome ?? []).filter((l) => nomes.some((n) => String(l.pessoa_nome ?? '').toLowerCase().includes(n.toLowerCase())))]
  .sort((a, b) => String(a.data_competencia).localeCompare(String(b.data_competencia)))

console.log(`\nPENDENTES: ${linhas.length}`)
for (const l of linhas) {
  const hist = Array.isArray(l.historico_pagamentos) ? l.historico_pagamentos : []
  console.log('\n' + '-'.repeat(70))
  console.log(`id ${l.id}`)
  console.log(`  "${l.descricao}"`)
  console.log(`  valor ${brl(l.valor)} · pago ${brl(l.valor_pago)} · categoria ${l.categoria ?? '-'} · ${l.loja_id ? nomeLoja.get(l.loja_id) : 'SEM LOJA'}`)
  console.log(`  competência ${dia(l.data_competencia)} · vencimento ${dia(l.data_vencimento)}`)
  console.log(`  criado ${dia(l.created_at)} · mexido ${dia(l.updated_at)} · forma ${l.forma_pagamento ?? '-'}`)
  if (hist.length) {
    for (const h of hist) console.log(`  histórico: ${dia(h?.data ?? h?.quando)} · ${brl(h?.valor)} · ${h?.obs ?? h?.motivo ?? JSON.stringify(h)}`)
  }
  // procura dinheiro parecido: lançamento pago com o mesmo valor perto da data
  const { data: parecidos } = await sb.from('lancamentos')
    .select('id, descricao, valor, status, data_competencia, created_at, categoria, pessoa_nome, loja_id')
    .eq('tipo', 'pagar').eq('valor', l.valor).neq('id', l.id).limit(6)
  if (parecidos?.length) {
    for (const p of parecidos) {
      console.log(`  MESMO VALOR: ${dia(p.data_competencia)} · "${String(p.descricao ?? '').slice(0, 40)}" · ${p.status} · ${p.pessoa_nome ?? 'sem fornecedor'} · ${p.loja_id ? nomeLoja.get(p.loja_id) : 'SEM LOJA'}`)
    }
  }
}
