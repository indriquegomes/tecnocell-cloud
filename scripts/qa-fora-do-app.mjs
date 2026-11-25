// Cria uma venda __QA__ de R$ 10,00 em dinheiro para testar a devolução
// "Fora do app (WhatsApp)" de ponta a ponta. Apaga o que criou antes (idempotente).
// Uso: node scripts/qa-fora-do-app.mjs criar | limpar
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const DEPOSITO = 'd25c7649-0f96-4c80-a7d2-f7e9f5203506' // PETRÓPOLIS ESTOQUE
const LOJA = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946'
const NUMERO = 999990 // número de venda reservado pro QA — fácil de achar e apagar
const NOME = '__QA__ DEVOLUCAO FORA DO APP'

async function limpar() {
  const { data: vendas } = await s.from('vendas').select('id').eq('numero', NUMERO)
  const ids = (vendas ?? []).map((v) => v.id)
  for (const id of ids) {
    const { data: devs } = await s.from('devolucoes').select('id').eq('venda_id', id)
    for (const d of devs ?? []) {
      await s.from('lancamentos').delete().eq('devolucao_id', d.id)
      await s.from('itens_devolucao').delete().eq('devolucao_id', d.id)
      await s.from('devolucoes').delete().eq('id', d.id)
    }
    await s.from('lancamentos').delete().eq('venda_id', id)
    await s.from('pagamentos_venda').delete().eq('venda_id', id)
    await s.from('itens_venda').delete().eq('venda_id', id)
    await s.from('vendas').delete().eq('id', id)
  }
  const { data: prods } = await s.from('produtos').select('id').eq('nome', NOME)
  for (const p of prods ?? []) {
    await s.from('estoque').delete().eq('produto_id', p.id)
    await s.from('produtos').delete().eq('id', p.id)
  }
  console.log('limpo:', ids.length, 'venda(s) e', (prods ?? []).length, 'produto(s)')
}

async function criar() {
  await limpar()
  const produtoId = randomUUID()
  const vendaId = randomUUID()
  const itemId = randomUUID()

  let r = await s.from('produtos').insert({ id: produtoId, nome: NOME, preco: 10, preco_custo: 5, ativo: false, visivel_catalogo: false, controla_serie: false, permite_estoque_negativo: false }).select('id').single()
  if (r.error) throw new Error('produto: ' + r.error.message)

  r = await s.from('estoque').insert({ produto_id: produtoId, deposito_id: DEPOSITO, quantidade: 0 })
  if (r.error) throw new Error('estoque: ' + r.error.message)

  r = await s.from('vendas').insert({
    id: vendaId, numero: NUMERO, data: new Date().toISOString().slice(0, 10), total: 10, desconto: 0,
    status: 'concluida', deposito_id: DEPOSITO, vendedor_nome: '__QA__', observacoes: '__QA__ teste devolucao fora do app',
  }).select('id').single()
  if (r.error) throw new Error('venda: ' + r.error.message)

  r = await s.from('itens_venda').insert({ id: itemId, venda_id: vendaId, produto_id: produtoId, nome: NOME, quantidade: 1, preco_unitario: 10, desconto_item: 0, total_item: 10, custo_unitario: 5 })
  if (r.error) throw new Error('item: ' + r.error.message)

  const { data: formaDinheiro } = await s.from('formas_pagamento').select('id').eq('tipo', 'dinheiro').limit(1).maybeSingle()
  if (formaDinheiro?.id) {
    r = await s.from('pagamentos_venda').insert({ venda_id: vendaId, forma_pagamento_id: formaDinheiro.id, valor: 10, status: 'pago' })
    if (r.error) console.log('aviso pagamento:', r.error.message)
  }

  console.log(JSON.stringify({ vendaId, produtoId, numero: NUMERO, loja: LOJA }))
}

const cmd = process.argv[2]
if (cmd === 'criar') await criar()
else if (cmd === 'limpar') await limpar()
else { console.log('Uso: node scripts/qa-fora-do-app.mjs criar|limpar'); process.exit(1) }
