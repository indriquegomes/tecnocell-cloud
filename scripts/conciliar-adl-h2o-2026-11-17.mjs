#!/usr/bin/env node
// CONCILIAÇÃO ADL + H2O (17/11/2026) — autorizada pelo dono.
//
// Dois problemas, duas correções:
//
// 1. ADL — a conta a pagar "PAGAMENTO DE MERCADORIA" de R$ 4.031,40 (competência
//    11/11) ficou PENDENTE depois de alguém usar "Desfazer" nela hoje de manhã.
//    O dinheiro saiu; ela precisa voltar a "pago". **Não encolhe nota**: o valor já
//    foi absorvido pelos abatimentos que as notas da ADL receberam (a nota 115
//    zerou com R$ 7.666,80 de histórico, mais que a nota de entrada de R$ 4.051,00).
//    Encolher de novo tiraria 4.031,40 da dívida duas vezes.
//
// 2. H2O — dois pagamentos de 16/11 foram criados já "pago" pelo formulário de
//    lançamento (4.445,19 Petrópolis e 7.197,10 Teresópolis). Criar quitado não
//    passa pelo abatimento, então as notas nunca encolheram: a dívida ficou
//    R$ 11.642,29 maior que a planilha. Aqui os dois valores encolhem as notas em
//    aberto de cada loja, da mais antiga para a mais nova — a mesma régua de sempre.
//
// Uso:
//   node scripts/conciliar-adl-h2o-2026-11-17.mjs            (mostra o que faria)
//   node scripts/conciliar-adl-h2o-2026-11-17.mjs --gravar    (grava)

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const GRAVAR = process.argv.includes('--gravar')
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n2 = (v) => Math.round(Number(v || 0) * 100) / 100

function env() {
  const txt = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
  const get = (k) => { const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
  return { url: get('NEXT_PUBLIC_SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') }
}

const { url, key } = env()
const sb = createClient(url, key, { auth: { persistSession: false } })

const ADL = '69d6bb5139449d9509f24978'
const H2O = '698ca68bab433fc39fef7b75'
const LINHA_ADL = 'bb52a646-37d8-460b-8ae9-a05244e3517d'
const PAGAMENTOS_H2O = [
  { valor: 4445.19 },
  { valor: 7197.10 },
]

const { data: lojas } = await sb.from('lojas').select('id, nome')
const nomeDaLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]))

const backup = { quando: new Date().toISOString(), antes: {}, depois: {} }
const desfazer = []

// ---------------------------------------------------------------- 1) ADL
const { data: linhaAdl } = await sb.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, categoria, pessoa_nome, pessoa_id, loja_id, data_competencia, data_pagamento, historico_pagamentos')
  .eq('id', LINHA_ADL).maybeSingle()
if (!linhaAdl) { console.error('linha da ADL não encontrada — nada feito'); process.exit(1) }
backup.antes.adl = linhaAdl

if (linhaAdl.status === 'pago') {
  console.log('ADL: a linha já está paga (nada a fazer).')
} else {
  console.log(`ADL: ${brl(linhaAdl.valor)} · "${linhaAdl.descricao}" · status ${linhaAdl.status}`)
  console.log(`     → volta para PAGO, valor_pago ${brl(linhaAdl.valor)}, cadastro do fornecedor ligado`)
  console.log('     → NÃO encolhe nota (o valor já foi absorvido pelos abatimentos da ADL)')
  if (GRAVAR) {
    const { error } = await sb.from('lancamentos').update({
      status: 'pago',
      valor_pago: Number(linhaAdl.valor),
      data_pagamento: new Date().toISOString(),
      pessoa_id: ADL,
      pessoa_nome: 'ADL',
      conta_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', LINHA_ADL)
    if (error) { console.error('ADL: falhou:', error.message); process.exit(1) }
    desfazer.push(`update lancamentos set status = 'pendente', valor_pago = 0, data_pagamento = null, pessoa_id = null, updated_at = now() where id = '${LINHA_ADL}';`)
  }
}

// ---------------------------------------------------------------- 2) H2O
const { data: h2oPagas } = await sb.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, categoria, pessoa_nome, pessoa_id, loja_id, data_competencia, data_pagamento, created_at, historico_pagamentos')
  .eq('tipo', 'pagar').eq('status', 'pago').eq('pessoa_nome', 'H2O')
  .in('data_competencia', ['2026-11-16'])
backup.antes.h2oPagamentos = h2oPagas ?? []

const { data: pendentesTodas } = await sb.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, loja_id, data_vencimento, historico_pagamentos, pessoa_nome, pessoa_id')
  .eq('tipo', 'pagar').eq('status', 'pendente')
  .order('data_vencimento')
// inclui as notas que só têm o NOME gravado (pessoa_id nulo): são da H2O do mesmo jeito
const h2oPendentes = (pendentesTodas ?? []).filter((l) => l.pessoa_id === H2O || String(l.pessoa_nome ?? '').trim() === 'H2O')
backup.antes.h2oNotas = h2oPendentes

for (const pag of PAGAMENTOS_H2O) {
  const linha = (h2oPagas ?? []).find((l) => Math.abs(Number(l.valor) - pag.valor) < 0.005)
  if (!linha) { console.log(`\nH2O: não achei o pagamento de ${brl(pag.valor)} — pulando.`); continue }
  const daLoja = h2oPendentes.filter((l) => l.loja_id === linha.loja_id && Number(l.valor) - Number(l.valor_pago ?? 0) > 0.005)
  console.log(`\nH2O: abatendo o pagamento de ${brl(pag.valor)} (${nomeDaLoja.get(linha.loja_id) ?? '?'}) nas notas em aberto:`)
  if (!daLoja.length) { console.log('   nenhuma nota em aberto nessa loja — o valor viraria crédito; não mexo.'); continue }
  let falta = n2(pag.valor)
  for (const nota of daLoja) {
    if (falta <= 0.005) break
    const restante = n2(Number(nota.valor) - Number(nota.valor_pago ?? 0))
    const abater = Math.min(restante, falta)
    const novo = n2(Number(nota.valor) - abater)
    const hist = Array.isArray(nota.historico_pagamentos) ? nota.historico_pagamentos : []
    console.log(`   ${String(nota.descricao).slice(0, 50).padEnd(50)} abate ${brl(abater).padStart(10)} → resta ${brl(novo).padStart(10)}${novo <= 0.005 ? ' (zera e sai dos pendentes)' : ''}`)
    if (GRAVAR) {
      const { error } = await sb.from('lancamentos').update({
        valor: novo,
        status: novo <= 0.005 ? 'cancelado' : 'pendente',
        descricao: `${String(nota.descricao).slice(0, 180)} (abateu ${abater.toFixed(2).replace('.', ',')} de pagamento)`,
        historico_pagamentos: [...hist, { valor: abater, forma: 'pagamento', data: new Date().toISOString() }],
        updated_at: new Date().toISOString(),
      }).eq('id', nota.id)
      if (error) { console.error('   falhou:', error.message); process.exit(1) }
      desfazer.push(`update lancamentos set valor = ${Number(nota.valor)}, status = 'pendente', historico_pagamentos = '${JSON.stringify(hist).replace(/'/g, "''")}'::jsonb, descricao = '${String(nota.descricao).replace(/'/g, "''")}' where id = '${nota.id}';`)
    }
    falta = n2(falta - abater)
  }
  if (falta > 0.005) console.log(`   sobrou ${brl(falta)} sem nota para abater (viraria crédito) — deixei quieto`)
  // limpeza: o pagamento passa a ter o cadastro do fornecedor (as regras filtram por id)
  if (GRAVAR && !linha.pessoa_id) {
    await sb.from('lancamentos').update({ pessoa_id: H2O, updated_at: new Date().toISOString() }).eq('id', linha.id)
    desfazer.push(`update lancamentos set pessoa_id = null where id = '${linha.id}';`)
  }
}

// ---------------------------------------------------------------- resultado
if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado. Rode com --gravar para aplicar.)'); process.exit(0) }

const dir = path.join(RAIZ, 'docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(path.join(dir, `backup-conciliacao-adl-h2o-${carimbo}.json`), JSON.stringify(backup, null, 2), 'utf8')
fs.writeFileSync(path.join(dir, `DESFAZER-conciliacao-adl-h2o-${carimbo}.sql`), desfazer.join('\n') + '\n', 'utf8')

// conferência depois
const soma = (arr) => n2(arr.reduce((t, l) => t + Math.max(0, Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0))
const { data: depoisAdl } = await sb.from('lancamentos').select('valor, valor_pago').eq('tipo', 'pagar').eq('status', 'pendente').eq('pessoa_id', ADL)
const { data: depoisH2oTodas } = await sb.from('lancamentos').select('valor, valor_pago, pessoa_nome, pessoa_id').eq('tipo', 'pagar').eq('status', 'pendente')
const depoisH2o = (depoisH2oTodas ?? []).filter((l) => l.pessoa_id === H2O || String(l.pessoa_nome ?? '').trim() === 'H2O')
console.log('\n=== DEPOIS ===')
console.log(`ADL pendente: ${brl(soma(depoisAdl ?? []))}  (planilha R$ 23.378,68)`)
console.log(`H2O pendente: ${brl(soma(depoisH2o))}  (planilha R$ 14.885,23)`)
console.log(`\nbackup e desfazer em docs/registros-banco/2026-11/ (${carimbo})`)
