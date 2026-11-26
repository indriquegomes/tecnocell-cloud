#!/usr/bin/env node
// AJUSTA O CUSTO DE UM PRODUTO — e a linha da tabela CUSTO junto.
//
// Custo vive em dois lugares e os dois precisam andar juntos:
//   - `produtos.preco_custo` (o que o PDV/relatório de margem usa)
//   - `itens_tabela_preco` da tabela CUSTO (usada pela tabela de preço "CUSTO")
//
// Só mexe no custo. Preço de venda (preco) e as tabelas ATACADO/VAREJO ficam como
// estão — mudar preço de venda é outra decisão.
//
// Uso:
//   node --no-warnings scripts/ajustar-custo-produto.mjs --produto <id> --custo 125        (ensaio)
//   node --no-warnings scripts/ajustar-custo-produto.mjs --produto <id> --custo 125 --aplicar
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

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`)
  return i > -1 ? process.argv[i + 1] : null
}
const PRODUTO = arg('produto')
const CUSTO = Math.round((Number(arg('custo')) || 0) * 100) / 100
const DRY = !process.argv.includes('--aplicar')
if (!PRODUTO || !(CUSTO > 0)) { console.error('uso: --produto <id> --custo <valor> [--aplicar]'); process.exit(1) }

const { data: prod, error: eP } = await sb.from('produtos').select('id, nome, preco, preco_custo').eq('id', PRODUTO).single()
if (eP) throw new Error('produto: ' + eP.message)
const { data: tabelaCusto } = await sb.from('tabelas_preco').select('id').eq('nome', 'CUSTO').maybeSingle()
const { data: linha } = tabelaCusto
  ? await sb.from('itens_tabela_preco').select('id, preco').eq('tabela_id', tabelaCusto.id).eq('produto_id', PRODUTO).maybeSingle()
  : { data: null }

const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',')
console.log(DRY ? '*** ENSAIO ***\n' : '*** APLICANDO ***\n')
console.log('produto :', prod.nome, `(${PRODUTO})`)
console.log('custo   :', brl(prod.preco_custo), '→', brl(CUSTO))
console.log('tabela CUSTO:', linha ? `${brl(linha.preco)} → ${brl(CUSTO)}` : 'produto não tem linha na tabela CUSTO')
console.log('preço de venda (não mexe):', brl(prod.preco))

const pasta = path.join(RAIZ, 'docs', 'registros-banco', '2026-11')
fs.mkdirSync(pasta, { recursive: true })
const arquivo = path.join(pasta, `backup-custo-${PRODUTO.slice(0, 8)}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(arquivo, JSON.stringify({ produto: prod, item_tabela_custo: linha, custo_novo: CUSTO }, null, 2), 'utf8')
console.log('\nbackup:', path.relative(RAIZ, arquivo))
if (DRY) { console.log('\nEnsaio encerrado. Rode com --aplicar.'); process.exit(0) }

const { error: eUpd } = await sb.from('produtos').update({ preco_custo: CUSTO, updated_at: new Date().toISOString() }).eq('id', PRODUTO)
if (eUpd) throw new Error('update produto: ' + eUpd.message)
if (linha) {
  const { error: eTab } = await sb.from('itens_tabela_preco').update({ preco: CUSTO }).eq('id', linha.id)
  if (eTab) throw new Error('update tabela CUSTO: ' + eTab.message)
}

const { data: depois } = await sb.from('produtos').select('nome, preco, preco_custo, updated_at').eq('id', PRODUTO).single()
console.log('\ndepois:', JSON.stringify(depois))
const { data: tabDepois } = tabelaCusto
  ? await sb.from('itens_tabela_preco').select('preco').eq('tabela_id', tabelaCusto.id).eq('produto_id', PRODUTO).maybeSingle()
  : { data: null }
console.log('tabela CUSTO agora:', tabDepois?.preco)
