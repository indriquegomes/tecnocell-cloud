#!/usr/bin/env node
// VENDA 15624 — dono do nome: cliente no lugar do "sem cliente".
//
// A venda saiu com `pessoa_id` nulo (registrada sem cliente) e o dono confirmou que é
// do cliente DAVID DOS SANTOS MORTES; forma de pagamento (PIX) está correta.
//
// Não mexe em dinheiro, estoque nem caixa: só liga a venda ao cadastro do cliente.
// O lançamento "Venda #N" que a venda gerou também recebe o cliente, porque é ele que
// relatórios por cliente e a tela de Fiados leem.
//
// Uso: node --no-warnings scripts/venda-15624-nome-cliente.mjs           (ensaio)
//      node --no-warnings scripts/venda-15624-nome-cliente.mjs --aplicar
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

const NUMERO = 15624
const CLIENTE_ID = '63d91db059a9c82974728b69'   // DAVID DOS SANTOS MORTES
const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',')

const { data: venda, error: eV } = await sb.from('vendas')
  .select('id, numero, total, status, pessoa_id, created_at, vendedor_nome')
  .eq('numero', NUMERO).single()
if (eV) throw new Error('venda: ' + eV.message)
const { data: cliente, error: eC } = await sb.from('pessoas').select('id, nome').eq('id', CLIENTE_ID).single()
if (eC) throw new Error('cliente: ' + eC.message)
if (venda.pessoa_id === CLIENTE_ID) { console.log('nada a fazer: a venda já é desse cliente.'); process.exit(0) }

const { data: lancs } = await sb.from('lancamentos').select('id, descricao, tipo, status, valor, pessoa_id, pessoa_nome').eq('venda_id', venda.id)

console.log(DRY ? '*** ENSAIO ***\n' : '*** APLICANDO ***\n')
console.log(`venda #${venda.numero} · ${brl(venda.total)} · ${venda.status} · ${String(venda.created_at).slice(0, 16)} · vendedora ${venda.vendedor_nome}`)
console.log('cliente hoje:', venda.pessoa_id ?? '(sem cliente)')
console.log('cliente novo:', cliente.nome, `(${cliente.id})`)
console.log('lançamentos da venda:', (lancs ?? []).map((l) => `${l.descricao} (${l.tipo}/${l.status}) pessoa=${l.pessoa_nome ?? '—'}`).join(' | ') || 'nenhum')

const pasta = path.join(RAIZ, 'docs', 'registros-banco', '2026-11')
fs.mkdirSync(pasta, { recursive: true })
const arquivo = path.join(pasta, `backup-venda-${NUMERO}-cliente-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(arquivo, JSON.stringify({ venda, lancamentos: lancs, cliente_novo: cliente }, null, 2), 'utf8')
console.log('\nbackup:', path.relative(RAIZ, arquivo))
if (DRY) { console.log('\nEnsaio encerrado. Rode com --aplicar.'); process.exit(0) }

const { error: eUpd } = await sb.from('vendas').update({ pessoa_id: CLIENTE_ID }).eq('id', venda.id)
if (eUpd) throw new Error('update venda: ' + eUpd.message)

for (const l of lancs ?? []) {
  const { error } = await sb.from('lancamentos').update({ pessoa_id: CLIENTE_ID, pessoa_nome: cliente.nome }).eq('id', l.id)
  if (error) throw new Error(`update lançamento ${l.descricao}: ` + error.message)
}

const { data: depois } = await sb.from('vendas').select('numero, pessoa_id, total').eq('id', venda.id).single()
console.log('\ndepois:', JSON.stringify(depois))
const { data: l2 } = await sb.from('lancamentos').select('id, descricao, pessoa_id, pessoa_nome').eq('venda_id', venda.id)
console.log('lançamentos:', JSON.stringify(l2))
