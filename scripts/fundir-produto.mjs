#!/usr/bin/env node
// FUNDE dois cadastros de produto que são a MESMA peça: leva a venda e o preço de
// tabela para o cadastro que fica e apaga o outro. Backup antes de qualquer escrita.
//
// Serve para duplicata criada por caminho automático (ex.: o botão "Chegou" da
// encomenda, que cadastrava o produto com o texto livre digitado no balcão).
//
// Uso:
//   node --no-warnings scripts/fundir-produto.mjs --de <id> --para <id>              (ensaio)
//   node --no-warnings scripts/fundir-produto.mjs --de <id> --para <id> --aplicar
//
// Recusa se o cadastro a apagar tiver item de nota de entrada ou número de série:
// esses apontam para o passado do estoque e precisam de análise antes.
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
const DE = arg('de')
const PARA = arg('para')
const DRY = !process.argv.includes('--aplicar')
if (!DE || !PARA) { console.error('faltou --de <id> e --para <id>'); process.exit(1) }
if (DE === PARA) { console.error('--de e --para são o mesmo id'); process.exit(1) }

const { data: prods, error: eP } = await sb.from('produtos').select('*').in('id', [DE, PARA])
if (eP) throw new Error('produtos: ' + eP.message)
const de = prods?.find((p) => p.id === DE)
const para = prods?.find((p) => p.id === PARA)
if (!de) throw new Error(`cadastro a apagar não existe: ${DE}`)
if (!para) throw new Error(`cadastro que fica não existe: ${PARA}`)

// ── fotografia ──────────────────────────────────────────────────────────────
const pega = async (tabela, id) => {
  const { data, error } = await sb.from(tabela).select('*').eq('produto_id', id)
  if (error) throw new Error(`${tabela}: ${error.message}`)
  return data ?? []
}
const snap = {
  produto_de: de,
  produto_para: para,
  itens_venda: [...await pega('itens_venda', DE)],
  estoque: [...await pega('estoque', DE)],
  itens_tabela_preco: [...await pega('itens_tabela_preco', DE)],
  movimentacoes_estoque: [...await pega('movimentacoes_estoque', DE)],
  itens_nota_entrada: [...await pega('itens_nota_entrada', DE)],
  numeros_serie: [...await pega('numeros_serie', DE)],
}
console.log(`${DRY ? '*** ENSAIO ***' : '*** APLICANDO ***'}\n`)
console.log(`APAGA: ${de.nome} (${DE}) custo ${de.preco_custo} preco ${de.preco}`)
console.log(`FICA : ${para.nome} (${PARA}) custo ${para.preco_custo} preco ${para.preco}`)
for (const [t, linhas] of Object.entries(snap)) {
  if (Array.isArray(linhas)) console.log(`   ${t}: ${linhas.length}`)
}
const qtdDe = snap.estoque.reduce((s, e) => s + Number(e.quantidade ?? 0), 0)
console.log(`   estoque a transferir: ${qtdDe}`)

if (snap.itens_nota_entrada.length > 0) throw new Error('recusado: o cadastro a apagar tem item de nota de entrada')
if (snap.numeros_serie.length > 0) throw new Error('recusado: o cadastro a apagar tem número de série')

// ── backup ──────────────────────────────────────────────────────────────────
const pasta = path.join(RAIZ, 'docs', 'registros-banco', '2026-11')
fs.mkdirSync(pasta, { recursive: true })
const arquivo = path.join(pasta, `backup-fundir-produto-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(arquivo, JSON.stringify(snap, null, 2), 'utf8')
console.log('\nbackup:', path.relative(RAIZ, arquivo))
if (DRY) { console.log('\nEnsaio encerrado. Rode com --aplicar para executar.'); process.exit(0) }

// ── venda vai junto ─────────────────────────────────────────────────────────
if (snap.itens_venda.length > 0) {
  const { error } = await sb.from('itens_venda').update({ produto_id: PARA }).in('id', snap.itens_venda.map((r) => r.id))
  if (error) throw new Error('mover venda: ' + error.message)
}
// ── preço de tabela: leva só o que o cadastro que fica ainda não tem ─────────
const { data: jaTem } = await sb.from('itens_tabela_preco').select('tabela_id').eq('produto_id', PARA)
const temSet = new Set((jaTem ?? []).map((r) => r.tabela_id))
for (const r of snap.itens_tabela_preco) {
  if (temSet.has(r.tabela_id)) {
    const { error } = await sb.from('itens_tabela_preco').delete().eq('id', r.id)
    if (error) throw new Error('apagar preço repetido: ' + error.message)
  } else {
    const { error } = await sb.from('itens_tabela_preco').update({ produto_id: PARA }).eq('id', r.id)
    if (error) throw new Error('mover preço de tabela: ' + error.message)
  }
}
// ── estoque: SOMA no que fica (aqui a peça é a mesma; não é entrada dobrada) ─
for (const e of snap.estoque) {
  const q = Number(e.quantidade ?? 0)
  if (q === 0) {
    const { error } = await sb.from('estoque').delete().eq('id', e.id)
    if (error) throw new Error('apagar linha de estoque zerada: ' + error.message)
    continue
  }
  const { data: destino } = await sb.from('estoque').select('id, quantidade').eq('produto_id', PARA).eq('deposito_id', e.deposito_id).maybeSingle()
  if (destino) {
    const { error } = await sb.from('estoque').update({ quantidade: Number(destino.quantidade ?? 0) + q }).eq('id', destino.id)
    if (error) throw new Error('somar estoque: ' + error.message)
  } else {
    const { error } = await sb.from('estoque').update({ produto_id: PARA }).eq('id', e.id)
    if (error) throw new Error('mover estoque: ' + error.message)
  }
}
// ── movimentação do cadastro apagado vai junto (histórico do estoque) ────────
if (snap.movimentacoes_estoque.length > 0) {
  const { error } = await sb.from('movimentacoes_estoque').update({ produto_id: PARA }).in('id', snap.movimentacoes_estoque.map((r) => r.id))
  if (error) throw new Error('mover movimentação: ' + error.message)
}
const { error: eDel } = await sb.from('produtos').delete().eq('id', DE)
if (eDel) throw new Error('apagar produto: ' + eDel.message)

console.log('\n✔ fundido')
const { data: fim } = await sb.from('estoque').select('deposito_id, quantidade').eq('produto_id', PARA)
console.log('estoque do cadastro que ficou:', JSON.stringify(fim))
const { data: restou } = await sb.from('produtos').select('id').eq('id', DE)
console.log('apagado ainda existe?', (restou ?? []).length)
