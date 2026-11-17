#!/usr/bin/env node
// COMPLETA O HISTÓRICO DE ABATIMENTO DAS NOTAS — só corrige rastro, não mexe em valor.
//
// Algumas notas tiveram o `valor` encolhido por abatimento, mas o pedaço abatido não
// entrou em `historico_pagamentos`. O total da dívida está certo; o que falta é o
// registro do que aconteceu — e é ele que qualquer conferência futura (planilha,
// auditoria, "de onde veio esse saldo") vai procurar.
//
// Regra: para cada linha de nota do fornecedor, compara
//   valor atual + soma do histórico   ×   valor_total da nota de entrada
// e, quando falta dinheiro explicado, grava UMA linha de histórico com o rótulo
// "abatimento não registrado". Nunca mexe em `valor`, `status` nem em qualquer total.
//
// Uso:
//   node scripts/completar-historico-abatimentos.mjs            (mostra)
//   node scripts/completar-historico-abatimentos.mjs --gravar    (grava, com backup)

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

const notasEntrada = await tudo(sb, 'notas_entrada', 'numero, valor_total, status', (q) => q.order('numero'))
const porNumero = new Map(notasEntrada.map((n) => [String(n.numero ?? ''), n]))
const linhas = await tudo(sb, 'lancamentos',
  'id, descricao, valor, valor_pago, status, tipo, pessoa_nome, loja_id, historico_pagamentos',
  (q) => q.eq('tipo', 'pagar').order('id'))

const backup = { quando: new Date().toISOString(), antes: [], depois: [] }
const desfazer = []

for (const l of linhas) {
  const m = String(l.descricao ?? '').match(/COMPRA MERCADORIA\s*-\s*NOTA\s+(\S+)/i)
  if (!m) continue
  // Só nota EM ABERTO. Nota cancelada está fora da dívida: escrever histórico nela não
  // muda total nenhum e ainda pode confundir quem lê depois (parece baixa viva).
  if (l.status !== 'pendente') continue
  const entrada = porNumero.get(m[1])
  if (!entrada) continue
  const hist = Array.isArray(l.historico_pagamentos) ? l.historico_pagamentos : []
  const somaHist = n2(hist.reduce((s, h) => s + Number(h?.valor ?? 0), 0))
  const soma = n2(Number(l.valor ?? 0) + somaHist)
  const falta = n2(Number(entrada.valor_total ?? 0) - soma)
  if (falta <= 0.009) continue   // fecha ou sobra (nota lançada acima da entrada): não toco

  console.log(`${String(l.pessoa_nome ?? '?').padEnd(18)} nota #${String(m[1]).padEnd(4)} entrada ${brl(entrada.valor_total).padStart(11)} × conta ${brl(l.valor).padStart(11)} + hist ${brl(somaHist).padStart(10)} → falta ${brl(falta).padStart(10)} (${l.status})`)
  if (!GRAVAR) continue
  backup.antes.push({ id: l.id, valor: l.valor, status: l.status, descricao: l.descricao, historico_pagamentos: l.historico_pagamentos })
  const { error } = await sb.from('lancamentos').update({
    historico_pagamentos: [...hist, {
      valor: falta,
      forma: 'abatimento não registrado',
      data: new Date().toISOString(),
      lancamento_id: null,
    }],
    updated_at: new Date().toISOString(),
  }).eq('id', l.id)
  if (error) { console.error('   falhou:', error.message); process.exit(1) }
  desfazer.push(`update lancamentos set historico_pagamentos = '${JSON.stringify(hist).replace(/'/g, "''")}'::jsonb, updated_at = now() where id = '${l.id}';`)
}

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado. Rode com --gravar para aplicar.)'); process.exit(0) }

const dir = path.join(RAIZ, 'docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(path.join(dir, `backup-historico-abatimentos-${carimbo}.json`), JSON.stringify(backup, null, 2), 'utf8')
fs.writeFileSync(path.join(dir, `DESFAZER-historico-abatimentos-${carimbo}.sql`), desfazer.join('\n') + '\n', 'utf8')
console.log(`\ngravado em ${backup.antes.length} nota(s) · backup e desfazer em docs/registros-banco/2026-11/ (${carimbo})`)
