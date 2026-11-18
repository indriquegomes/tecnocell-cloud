#!/usr/bin/env node
// ITEM 8 — caso 1: MATHEUS MATTOS DE SOUZA DUARTE.
//
// O nome carregava a dívida: "MATHEUS MATTOS DE SOUZA DUARTE (DEVENDO R$654,50)".
// O dono confirmou em 18/11/2026 que a dívida é real (cliente sumiu, não responde,
// não paga). A dívida tem âncora ao centavo: vendas #176207 (R$ 3,50, 10/09/2025) e
// #176411 (R$ 651,00, 11/09/2025), as duas com pagamento em `pendente` — fiado do
// SIGE que nunca foi quitado e nunca virou lançamento no app.
//
// O que faz (regra do item 8 para dívida real):
//   nome limpo · aviso interno · motivo · observação · valor no A Receber.
//   `nome_norm` é gerado no banco, não precisa mexer.
//
// Uso: node --no-warnings scripts/cadastro-matheus-mattos.mjs           (ensaio)
//      node --no-warnings scripts/cadastro-matheus-mattos.mjs --aplicar
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = process.cwd()
const txt = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
const get = (k) => {
  const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const DRY = !process.argv.includes('--aplicar')

const ID = '646628a48f0e8d151c245b42'
const NOME_LIMPO = 'MATHEUS MATTOS DE SOUZA DUARTE'
const MOTIVO = 'DEVE R$ 654,50 (fiado de 2025) — cobrar antes de vender'
const OBS = '⚠ Devedor: R$ 654,50 em fiado de 2025 (vendas #176207 e #176411, pagamentos pendentes no SIGE). Cliente não responde cobrança. Cobrar antes de vender.'
const VALOR = 654.5
const VENC = '2025-09-11'

const { data: antes, error: eP } = await sb.from('pessoas').select('*').eq('id', ID).single()
if (eP) throw new Error('pessoa: ' + eP.message)
if (!String(antes.nome).includes('DEVENDO')) {
  console.log('nada a fazer: o nome já está limpo →', antes.nome)
  process.exit(0)
}
const { data: jaTem } = await sb.from('lancamentos').select('id, valor, status, descricao').eq('pessoa_id', ID).eq('tipo', 'receber')
if ((jaTem ?? []).length) throw new Error('já existe A Receber para esta pessoa: ' + JSON.stringify(jaTem))

console.log(DRY ? '*** ENSAIO ***\n' : '*** APLICANDO ***\n')
console.log('ANTES :', antes.nome)
console.log('DEPOIS:', NOME_LIMPO)
console.log('motivo:', MOTIVO)
console.log('obs   :', OBS)
console.log('A Receber a criar: R$', VALOR.toFixed(2), '· venc.', VENC)

const pasta = path.join(RAIZ, 'docs', 'registros-banco', '2026-11')
fs.mkdirSync(pasta, { recursive: true })
const arquivo = path.join(pasta, `backup-matheus-mattos-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(arquivo, JSON.stringify({ pessoa: antes }, null, 2), 'utf8')
console.log('\nbackup:', path.relative(RAIZ, arquivo))
if (DRY) { console.log('\nEnsaio encerrado. Rode com --aplicar.'); process.exit(0) }

const { error: eUpd } = await sb.from('pessoas').update({
  nome: NOME_LIMPO,
  nome_fantasia: NOME_LIMPO,
  nao_vender: true,
  nao_vender_motivo: MOTIVO,
  observacoes: OBS,
}).eq('id', ID)
if (eUpd) throw new Error('update pessoa: ' + eUpd.message)

const { error: eLanc } = await sb.from('lancamentos').insert({
  id: crypto.randomUUID(),
  descricao: 'A Receber — anotação antiga (R$ 654,50) — vendas #176207 e #176411',
  valor: VALOR,
  tipo: 'receber',
  status: 'pendente',
  categoria: 'Fiado (a receber)',
  data_competencia: VENC,
  data_vencimento: VENC,
  pessoa_id: ID,
  pessoa_nome: NOME_LIMPO,
})
if (eLanc) throw new Error('insert A Receber: ' + eLanc.message)

// ── confere ────────────────────────────────────────────────────────────────
const { data: depois } = await sb.from('pessoas').select('nome, nome_norm, nome_fantasia, nao_vender, nao_vender_motivo, observacoes').eq('id', ID).single()
console.log('\npessoa agora:', JSON.stringify(depois, null, 2))
const { data: lanc } = await sb.from('lancamentos').select('id, tipo, status, valor, descricao, data_vencimento, pessoa_id, pessoa_nome').eq('pessoa_id', ID)
console.log('lançamentos:', JSON.stringify(lanc, null, 2))
