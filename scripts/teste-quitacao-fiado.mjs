// TESTE DE PONTA A PONTA — quita UM fiado de verdade pelo caminho novo do banco
// (`receber_lancamentos_lote`, o F9 em lote), confere o que foi gravado e DEVOLVE tudo
// como estava. Nada fica no caixa.
//
// O que este teste prova:
//   1) `data_pagamento` sai com HORA (instante), não com data pura;
//   2) o movimento de caixa nasce com `lancamento_id` e `origem = 'pdv'` — é o vínculo
//      que faz o botão "Desfazer" do Financeiro achar a linha.
//
// Uso: node scripts/teste-quitacao-fiado.mjs <lancamento_id> <forma> [--manter]
//   sem --manter: faz, confere e desfaz (deixa tudo como estava)
//   com --manter: deixa quitado (não usar em teste)
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dia = (x) => (x ?? '').slice(0, 19).replace('T', ' ')
const MANTER = process.argv.includes('--manter')
const lancamentoId = process.argv[2]
const forma = process.argv[3] ?? 'PIX'
if (!lancamentoId) { console.error('uso: node scripts/teste-quitacao-fiado.mjs <lancamento_id> <forma> [--manter]'); process.exit(1) }

// ── 1. foto de antes
const { data: antes, error: e1 } = await s.from('lancamentos')
  .select('*').eq('id', lancamentoId).maybeSingle()
if (e1) throw new Error(e1.message)
if (!antes) { console.error('lançamento não encontrado'); process.exit(1) }
if (antes.tipo !== 'receber' || antes.status !== 'pendente') { console.error('precisa ser um "a receber" pendente'); process.exit(1) }
const valor = Math.round((Number(antes.valor) - Number(antes.valor_pago ?? 0)) * 100) / 100
const { data: caixa } = await s.from('caixas').select('id, loja_id').eq('status', 'aberto').eq('loja_id', antes.loja_id).maybeSingle()
if (!caixa) { console.error('não há caixa aberto nesta loja — o caminho novo exige caixa aberto'); process.exit(1) }
const { data: movsAntes } = await s.from('movimentos_caixa').select('id').eq('lancamento_id', lancamentoId)

console.log(`\n=== TESTE: ${antes.descricao} · R$ ${brl(valor)} · forma ${forma} ===`)
console.log(`ANTES: status ${antes.status} · valor_pago ${brl(antes.valor_pago)} · data_pagamento ${antes.data_pagamento ?? '—'} · movimentos ligados ${(movsAntes ?? []).length}`)

// ── 2. quita pelo caminho novo (RPC do lote, com UMA dívida só)
const operacaoId = crypto.randomUUID()
const { data: rpc, error: e2 } = await s.rpc('receber_lancamentos_lote', {
  p_alocacoes: [{ id: lancamentoId, valor }],
  p_forma: forma,
  p_conta_id: null,
  p_loja_id: antes.loja_id,
  p_operacao_id: operacaoId,
})
if (e2) { console.error('RPC falhou:', e2.message); process.exit(1) }
console.log(`RPC devolveu: ${JSON.stringify(rpc)}`)

// ── 3. confere o que foi gravado
const { data: depois } = await s.from('lancamentos').select('status, valor_pago, data_pagamento, forma_pagamento, historico_pagamentos').eq('id', lancamentoId).maybeSingle()
const { data: movs } = await s.from('movimentos_caixa').select('id, tipo, valor, forma_pagamento, motivo, lancamento_id, origem, created_at').eq('lancamento_id', lancamentoId)
const mov = (movs ?? [])[0]
const temHora = !!depois?.data_pagamento && !String(depois.data_pagamento).includes('T00:00:00')
const temVinculo = !!mov && mov.origem === 'pdv'
console.log(`\nDEPOIS: status ${depois?.status} · valor_pago ${brl(depois?.valor_pago)} · forma ${depois?.forma_pagamento}`)
console.log(`  data_pagamento : ${depois?.data_pagamento}  → ${temHora ? '✔ COM HORA' : '✖ ainda data pura'}`)
console.log(`  movimento      : ${mov ? `${dia(mov.created_at)} · ${mov.tipo} · R$ ${brl(mov.valor)} · ${mov.forma_pagamento} · origem ${mov.origem ?? 'NENHUMA'} · ${mov.motivo}` : 'NENHUM'}`)
console.log(`  vínculo        : ${temVinculo ? '✔ ligado ao lançamento (Desfazer acha)' : '✖ sem vínculo'}`)

// ── 4. devolve tudo como estava
if (!MANTER) {
  for (const m of movs ?? []) {
    const { error } = await s.from('movimentos_caixa').delete().eq('id', m.id)
    if (error) { console.error('erro ao apagar movimento:', error.message); process.exit(1) }
  }
  const { error: e3 } = await s.from('lancamentos').update({
    status: antes.status,
    valor_pago: antes.valor_pago ?? 0,
    forma_pagamento: antes.forma_pagamento,
    data_pagamento: antes.data_pagamento,
    historico_pagamentos: antes.historico_pagamentos,
    updated_at: new Date().toISOString(),
  }).eq('id', lancamentoId)
  if (e3) { console.error('erro ao devolver o lançamento:', e3.message); process.exit(1) }
  await s.from('recebimentos_lote_operacoes').delete().eq('id', operacaoId)

  const { data: voltou } = await s.from('lancamentos').select('status, valor_pago, data_pagamento, forma_pagamento').eq('id', lancamentoId).maybeSingle()
  const { data: movsDepois } = await s.from('movimentos_caixa').select('id').eq('lancamento_id', lancamentoId)
  console.log(`\nDESFEITO: status ${voltou?.status} · valor_pago ${brl(voltou?.valor_pago)} · data_pagamento ${voltou?.data_pagamento ?? '—'} · movimentos ligados ${(movsDepois ?? []).length}`)
}

const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/teste-quitacao-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), antes, depois, mov, rpc, operacaoId }, null, 2), 'utf8')
console.log(`\nregistro: ${dir}/teste-quitacao-${carimbo}.json`)
