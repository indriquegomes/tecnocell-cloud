#!/usr/bin/env node
// ITEM 8 — caso 1, parte 2: o A Receber de R$ 654,50 do MATHEUS MATTOS DE SOUZA
// DUARTE vai para PERDA (decisão do dono em 18/11/2026: "não vai ser pago, leva pras
// perdas e bloqueia venda pra ele").
//
// Usa o caminho oficial do app, o mesmo do desconto do F9:
//   1. RPC `aplicar_desconto_fiado` — abate a dívida com FOR UPDATE e grava a linha
//      de desconto no histórico (valor 0 + status pago + "Desconto — motivo" é a
//      convenção do app para dívida perdoada);
//   2. despesa "Perda com fiado" no resultado do mês (dinheiro que não entrou — sem
//      conta e sem caixa), exatamente como `aplicarDescontoCrediario` faz.
// O aviso interno do cadastro CONTINUA ligado: perdão de dívida não limpa aviso, de
// propósito — o PDV segue avisando e o App segue bloqueando a compra.
//
// Uso: node --no-warnings scripts/perdoar-matheus.mjs           (ensaio)
//      node --no-warnings scripts/perdoar-matheus.mjs --aplicar
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

const LANC_ID = '67d8a918-d0f2-46cd-bdb2-90f67b2d76a7'
const PESSOA_ID = '646628a48f0e8d151c245b42'
const DONO_ID = '53431729-852e-4a55-8168-e1241b756407'   // Indrique Gomes França (master)
const MOTIVO = 'Não vou receber mais'

const { data: lanc, error: eL } = await sb.from('lancamentos').select('*').eq('id', LANC_ID).single()
if (eL) throw new Error('lançamento: ' + eL.message)
if (lanc.status !== 'pendente') { console.log('nada a fazer: lançamento está', lanc.status); process.exit(0) }
const restante = Math.round((Number(lanc.valor) - Number(lanc.valor_pago ?? 0)) * 100) / 100
if (Math.abs(restante - 654.5) > 0.005) throw new Error(`saldo inesperado: ${restante}`)

const { data: pes } = await sb.from('pessoas').select('id, nome, nao_vender, nao_vender_motivo, observacoes').eq('id', PESSOA_ID).single()

console.log(DRY ? '*** ENSAIO ***\n' : '*** APLICANDO ***\n')
console.log('lançamento:', lanc.id, '·', lanc.descricao, '· saldo', restante.toFixed(2))
console.log('motivo    :', MOTIVO, '→ categoria "Perda com fiado"')
console.log('cadastro  :', pes?.nome, '· aviso interno:', pes?.nao_vender ? 'LIGADO (fica)' : 'desligado')

const pasta = path.join(RAIZ, 'docs', 'registros-banco', '2026-11')
fs.mkdirSync(pasta, { recursive: true })
const arquivo = path.join(pasta, `backup-perdao-matheus-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(arquivo, JSON.stringify({ lancamento: lanc, pessoa: pes }, null, 2), 'utf8')
console.log('\nbackup:', path.relative(RAIZ, arquivo))
if (DRY) { console.log('\nEnsaio encerrado. Rode com --aplicar.'); process.exit(0) }

// 1. RPC oficial do desconto
const { data: res, error: eRpc } = await sb.rpc('aplicar_desconto_fiado', {
  p_lancamento_id: LANC_ID,
  p_desconto: restante,
  p_motivo: MOTIVO,
})
if (eRpc) throw new Error('RPC aplicar_desconto_fiado: ' + eRpc.message)
console.log('\nRPC:', JSON.stringify(res))

// 2. despesa no resultado do mês (mesmo formato de aplicarDescontoCrediario)
const aplicado = Number(res?.desconto_aplicado ?? 0)
if (aplicado > 0) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { error: eDesp } = await sb.from('lancamentos').insert({
    id: crypto.randomUUID(),
    descricao: `Perda com fiado — ${lanc.descricao} (${MOTIVO})`,
    valor: aplicado,
    valor_pago: aplicado,
    tipo: 'pagar',
    status: 'pago',
    categoria: 'Perda com fiado',
    pessoa_nome: lanc.pessoa_nome ?? null,
    pessoa_id: lanc.pessoa_id ?? null,
    loja_id: lanc.loja_id ?? null,
    conta_id: null,
    forma_pagamento: 'Desconto',
    criado_por: DONO_ID,
    data_competencia: hoje,
    data_vencimento: hoje,
    data_pagamento: hoje,
    updated_at: new Date().toISOString(),
  })
  if (eDesp) throw new Error('despesa da perda: ' + eDesp.message)
}

// 3. histórico no cadastro; o aviso interno NÃO é tocado
const obs = `${pes?.observacoes ?? ''}\n18/11/2026: dívida de R$ 654,50 levada a PERDA (cliente não paga). Venda bloqueada pelo aviso interno.`.trim()
const { error: ePes } = await sb.from('pessoas').update({ observacoes: obs }).eq('id', PESSOA_ID)
if (ePes) throw new Error('observação: ' + ePes.message)

// ── confere ────────────────────────────────────────────────────────────────
const { data: depois } = await sb.from('lancamentos').select('id, tipo, status, valor, valor_pago, categoria, descricao, historico_pagamentos').eq('id', LANC_ID).single()
console.log('\nA Receber agora:', JSON.stringify(depois, null, 2))
const { data: desp } = await sb.from('lancamentos').select('id, tipo, status, valor, categoria, descricao, forma_pagamento, conta_id, criado_por, data_competencia').eq('pessoa_id', PESSOA_ID).eq('categoria', 'Perda com fiado')
console.log('\ndespesa da perda:', JSON.stringify(desp, null, 2))
const { data: cliente } = await sb.from('pessoas').select('nome, nao_vender, nao_vender_motivo, observacoes').eq('id', PESSOA_ID).single()
console.log('\ncadastro:', JSON.stringify(cliente, null, 2))
