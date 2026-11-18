#!/usr/bin/env node
// LIMPEZA DOS PRODUTOS CRIADOS PELO BOTÃO "CHEGOU" DA ENCOMENDA.
//
// O que este script faz, com backup antes de qualquer escrita:
//
//   A. APAGA dois cadastros com nome errado que têm gêmeo correto no catálogo,
//      estoque 0 e nenhuma venda (a entrada que existiu foi a errada):
//        "frontal sansung m54 original nacional com aro"  → gêmeo FRONTAL SAMSUNG M54 ORIGINAL NACIONAL COM ARO
//        "11766 - FRONTAL SAMSUNG S23 ULTRA OLED COM ARO" → gêmeo FRONTAL SAMSUNG S23 ULTRA OLED COM ARO
//
//   B. FUNDE três pares duplicados no cadastro que sobrevive (o que tem nota de
//      entrada/tabelas de preço), levando a venda e o preço de tabela junto e
//      apagando a linha de estoque do clone — essa linha É a entrada dobrada:
//        TAMPA IPHONE 12 VERMELHA      clone do app → SIGE 63dec6bd…
//        GAVETA SAMSUNG S21 FE CHUMBO  clone do app → 857b9efb…
//        GAVETA XIAOMIMI 9T/9T PRO PRETO clone do app → 0e26c169…
//
// NÃO toca em "frontal poco 81" (tem 1 unidade em estoque e nenhum gêmeo claro).
//
// Uso: node --no-warnings scripts/limpar-produtos-encomenda.mjs        (ensaio, não escreve)
//      node --no-warnings scripts/limpar-produtos-encomenda.mjs --aplicar
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

// tipo 'apagar' = cadastro errado sem uso; tipo 'fundir' = duplicata com venda/preço
const PLANO = [
  { tipo: 'apagar', id: '4140eec1-6a28-435d-b5dd-571a831ddf52', motivo: 'nome errado; gêmeo 68de6e97 (FRONTAL SAMSUNG M54 ORIGINAL NACIONAL COM ARO)' },
  { tipo: 'apagar', id: 'c68f3489-7886-48c8-a914-09674de79c56', motivo: 'nome errado (prefixo "11766 -"); gêmeo 6980f7e3 (FRONTAL SAMSUNG S23 ULTRA OLED COM ARO)' },
  { tipo: 'fundir', id: '4882b9cf-10bb-488a-b021-375160d61618', para: '63dec6bd59a9c82738d5cb32', motivo: 'TAMPA IPHONE 12 VERMELHA — fica o cadastro do SIGE' },
  { tipo: 'fundir', id: '8fcede06-7851-4db4-8666-a0142971f636', para: '857b9efb-5cd6-492b-a40d-6507aaaa489d', motivo: 'GAVETA SAMSUNG S21 FE CHUMBO — fica o que tem nota de entrada' },
  { tipo: 'fundir', id: '982adeb7-a742-4c97-a823-38da40ddde02', para: '0e26c169-1caf-48ce-bf75-17059c43f144', motivo: 'GAVETA XIAOMIMI 9T/9T PRO PRETO — fica o que tem nota de entrada' },
]

const brl = (v) => Number(v || 0).toFixed(2)

// ── 1. confere o estado e recusa se algo mudou ───────────────────────────────
const ids = PLANO.map((p) => p.id)
const { data: prods, error: eP } = await sb.from('produtos').select('id, nome, preco, preco_custo, ativo').in('id', ids)
if (eP) throw new Error('produtos: ' + eP.message)
if ((prods ?? []).length !== ids.length) throw new Error(`esperava ${ids.length} produtos, achei ${prods?.length}`)
const nome = new Map(prods.map((p) => [p.id, p.nome]))

const { data: vendasAtingidas } = await sb.from('itens_venda').select('*').in('produto_id', ids)
const { data: estoqueAtingido } = await sb.from('estoque').select('*').in('produto_id', ids)
const { data: tabelasAtingidas } = await sb.from('itens_tabela_preco').select('*').in('produto_id', ids)
const { data: movsAtingidas } = await sb.from('movimentacoes_estoque').select('*').in('produto_id', ids)
const { data: notasAtingidas } = await sb.from('itens_nota_entrada').select('*').in('produto_id', ids)
const { data: seriesAtingidas } = await sb.from('numeros_serie').select('*').in('produto_id', ids)

// ── 2. plano na tela ────────────────────────────────────────────────────────
console.log(DRY ? '*** ENSAIO — nada é escrito ***\n' : '*** APLICANDO ***\n')
for (const p of PLANO) {
  console.log(`• ${nome.get(p.id)}  (${p.id})`)
  console.log(`   ${p.motivo}`)
  const meus = {
    vendas: (vendasAtingidas ?? []).filter((r) => r.produto_id === p.id),
    estoque: (estoqueAtingido ?? []).filter((r) => r.produto_id === p.id),
    tabelas: (tabelasAtingidas ?? []).filter((r) => r.produto_id === p.id),
    movimentos: (movsAtingidas ?? []).filter((r) => r.produto_id === p.id),
    notas: (notasAtingidas ?? []).filter((r) => r.produto_id === p.id),
    series: (seriesAtingidas ?? []).filter((r) => r.produto_id === p.id),
  }
  console.log(`   linhas de venda: ${meus.vendas.length} · estoque: ${meus.estoque.map((e) => brl(e.quantidade)).join(',') || '0'} · tabelas: ${meus.tabelas.length} · movimentos: ${meus.movimentos.length} · notas: ${meus.notas.length} · séries: ${meus.series.length}`)
  if (p.tipo === 'fundir') {
    if (meus.notas.length > 0) throw new Error(`recusado: ${p.id} tem item de nota de entrada — não fundir sem analisar`)
    if (meus.series.length > 0) throw new Error(`recusado: ${p.id} tem número de série`)
  } else {
    if (meus.vendas.length > 0) throw new Error(`recusado: ${p.id} tem venda — é "fundir", não "apagar"`)
  }
}

// ── 3. backup ───────────────────────────────────────────────────────────────
const pasta = path.join(RAIZ, 'docs', 'registros-banco', '2026-11')
fs.mkdirSync(pasta, { recursive: true })
const arquivo = path.join(pasta, `backup-produtos-encomenda-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(arquivo, JSON.stringify({
  plano: PLANO, produtos: prods, itens_venda: vendasAtingidas, estoque: estoqueAtingido,
  itens_tabela_preco: tabelasAtingidas, movimentacoes_estoque: movsAtingidas,
  itens_nota_entrada: notasAtingidas, numeros_serie: seriesAtingidas,
}, null, 2), 'utf8')
console.log('\nbackup:', path.relative(RAIZ, arquivo))
if (DRY) { console.log('\nEnsaio encerrado. Rode com --aplicar para executar.'); process.exit(0) }

// ── 4. executa ──────────────────────────────────────────────────────────────
const falha = (msg) => { throw new Error(msg) }

for (const p of PLANO) {
  const meuNome = nome.get(p.id)
  if (p.tipo === 'fundir') {
    // venda vai junto: mantém o histórico da venda apontando pra um produto que existe
    const v = (vendasAtingidas ?? []).filter((r) => r.produto_id === p.id)
    if (v.length) {
      const { error } = await sb.from('itens_venda').update({ produto_id: p.para }).in('id', v.map((r) => r.id))
      if (error) falha(`venda de ${meuNome}: ${error.message}`)
    }
    // preço de tabela: leva só o que o sobrevivente ainda não tem
    const { data: jaTem } = await sb.from('itens_tabela_preco').select('tabela_id').eq('produto_id', p.para)
    const temSet = new Set((jaTem ?? []).map((r) => r.tabela_id))
    for (const r of (tabelasAtingidas ?? []).filter((x) => x.produto_id === p.id)) {
      if (temSet.has(r.tabela_id)) {
        const { error } = await sb.from('itens_tabela_preco').delete().eq('id', r.id)
        if (error) falha(`tabela ${r.tabela_id} de ${meuNome}: ${error.message}`)
      } else {
        const { error } = await sb.from('itens_tabela_preco').update({ produto_id: p.para }).eq('id', r.id)
        if (error) falha(`tabela ${r.tabela_id} de ${meuNome}: ${error.message}`)
      }
    }
  }
  // A linha de estoque do clone SAI (não soma no sobrevivente): ela é a entrada que o
  // botão "Chegou" fez. Somar dobraria a peça quando a nota de entrada já trouxe.
  for (const e of (estoqueAtingido ?? []).filter((r) => r.produto_id === p.id)) {
    const { error } = await sb.from('estoque').delete().eq('id', e.id)
    if (error) falha(`estoque de ${meuNome}: ${error.message}`)
  }
  for (const m of (movsAtingidas ?? []).filter((r) => r.produto_id === p.id)) {
    const { error } = await sb.from('movimentacoes_estoque').delete().eq('id', m.id)
    if (error) falha(`movimento de ${meuNome}: ${error.message}`)
  }
  const { error: eDel } = await sb.from('produtos').delete().eq('id', p.id)
  if (eDel) falha(`apagar ${meuNome}: ${eDel.message}`)
  console.log(`✔ ${meuNome} (${p.tipo})`)
}

console.log('\nRESULTADO:')
const { data: sobrou } = await sb.from('produtos').select('id, nome, ativo').in('id', PLANO.map((p) => p.para).filter(Boolean))
console.log('cadastros que ficaram:', JSON.stringify(sobrou, null, 2))
const { data: restos } = await sb.from('produtos').select('id, nome').in('id', ids)
console.log('apagados ainda existem?', (restos ?? []).length === 0 ? 'não (0)' : JSON.stringify(restos))
const { data: tampa } = await sb.from('estoque').select('produto_id, quantidade').eq('produto_id', '63dec6bd59a9c82738d5cb32')
console.log('estoque da TAMPA IPHONE 12 VERMELHA:', JSON.stringify(tampa))
