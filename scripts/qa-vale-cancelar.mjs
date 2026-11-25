// Venda/crédito __QA__ para testar o "só cancelar (não devo nada)" do vale-crédito.
// Cria a pessoa e o crédito; limpar apaga os dois e tudo que o teste criou.
// Uso: node scripts/qa-vale-cancelar.mjs criar | limpar | ver
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const NOME = '__QA__ VALE CANCELAR'
const LOJA = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946' // Petrópolis

async function acharPessoa() {
  const { data } = await s.from('pessoas').select('id').eq('nome', NOME).maybeSingle()
  return data?.id ?? null
}

async function limpar() {
  const pessoaId = await acharPessoa()
  if (pessoaId) {
    const { data: l } = await s.from('lancamentos').select('id').eq('pessoa_nome', NOME)
    for (const x of l ?? []) await s.from('lancamentos').delete().eq('id', x.id)
    await s.from('creditos_clientes').delete().eq('pessoa_id', pessoaId)
    await s.from('pessoas').delete().eq('id', pessoaId)
  }
  const { data: l2 } = await s.from('lancamentos').select('id').ilike('descricao', '%' + NOME + '%')
  for (const x of l2 ?? []) await s.from('lancamentos').delete().eq('id', x.id)
  console.log('limpo: pessoa=' + (pessoaId ? 'sim' : 'nao'))
}

async function criar() {
  await limpar()
  const id = randomUUID()
  let r = await s.from('pessoas').insert({ id, nome: NOME }).select('id').single()
  if (r.error) throw new Error('pessoa: ' + r.error.message)
  r = await s.from('creditos_clientes').insert({
    pessoa_id: id, pessoa_nome: NOME, valor: 25, tipo: 'credito',
    descricao: '__QA__ vale de teste', loja_id: LOJA,
  }).select('id').single()
  if (r.error) throw new Error('credito: ' + r.error.message)
  console.log(JSON.stringify({ pessoaId: id, creditoId: r.data.id, valor: 25 }))
}

async function ver() {
  const pessoaId = await acharPessoa()
  if (!pessoaId) { console.log('pessoa inexistente'); return }
  const { data: cred } = await s.from('creditos_clientes').select('id,valor,tipo,descricao,estorna_credito_id').eq('pessoa_id', pessoaId)
  const { data: lan } = await s.from('lancamentos').select('id,descricao,valor,status,forma_pagamento').eq('pessoa_nome', NOME)
  const saldo = (cred ?? []).reduce((t, c) => t + (c.tipo === 'credito' ? Number(c.valor) : -Number(c.valor)), 0)
  console.log('CREDITOS:', JSON.stringify(cred))
  console.log('LANCAMENTOS:', JSON.stringify(lan))
  console.log('SALDO:', saldo)
}

const cmd = process.argv[2]
if (cmd === 'criar') await criar()
else if (cmd === 'limpar') await limpar()
else if (cmd === 'ver') await ver()
else { console.log('Uso: node scripts/qa-vale-cancelar.mjs criar|limpar|ver'); process.exit(1) }
