#!/usr/bin/env node
// Cria as promoções da campanha BLACK TECBLACK (27/11/2026) na aba Promoções.
// Só mexe em promocoes / itens_promocao / faixas_promocao. Nenhum produto é alterado.
// Idempotente: promoção de mesmo nome é apagada e recriada.
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RAIZ = path.resolve(import.meta.dirname, '..')
const txt = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
const get = (k) => { const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const INICIO = '2026-11-27'
const FIM = '2026-11-30'
const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',')
const DESCRICAO = 'Campanha Black Friday TEC BLACK — preços de queima de estoque. De 27/11 a 30/11/2026.'

const FIXOS = [
  ['12460', 18.00],
  ['12437', 35.00],
  ['03393', 42.00],
  ['12453', 30.00],
  ['06483', 60.00],
  ['07615', 93.00],
  ['07627', 250.00],
]
const LOTES = [
  { codigo: '12439', unidade: 2.30, lote: 23.00, nome: 'BLACK TECBLACK - CABO 12439 10 UNIDADES' },
  { codigo: '12552', unidade: 5.50, lote: 55.00, nome: 'BLACK TECBLACK - CABO 12552 10 UNIDADES' },
]
const NOME_FIXOS = 'BLACK TECBLACK - PRECOS'
// nomes usados antes da prorrogação para o dia 30 — ficam órfãos se não forem limpos
const NOMES_ANTIGOS = ['BLACK TECBLACK - PRECOS 27/11']

const codigos = [...FIXOS.map(([c]) => c), ...LOTES.map((l) => l.codigo)]
const { data: prods, error: eProd } = await sb.from('produtos').select('id, codigo, nome, preco').in('codigo', codigos)
if (eProd) { console.error('ERRO produtos:', eProd.message); process.exit(1) }
const porCodigo = new Map((prods ?? []).map((p) => [p.codigo, p]))
for (const c of codigos) if (!porCodigo.has(c)) { console.error('Produto não encontrado:', c); process.exit(1) }

async function limpar(nome) {
  const { data } = await sb.from('promocoes').select('id').eq('nome', nome)
  for (const p of data ?? []) {
    await sb.from('itens_promocao').delete().eq('promocao_id', p.id)
    await sb.from('faixas_promocao').delete().eq('promocao_id', p.id)
    await sb.from('promocoes').delete().eq('id', p.id)
  }
}
for (const antigo of NOMES_ANTIGOS) await limpar(antigo)

// ---------- 1) preço fixo (valor direto) ----------
await limpar(NOME_FIXOS)
const { data: promoFixa, error: eFixa } = await sb.from('promocoes').insert({
  nome: NOME_FIXOS,
  tipo: 'valor_direto',
  valor: 0,
  data_inicio: INICIO,
  data_fim: FIM,
  ativa: true,
  descricao: DESCRICAO,
}).select('id').single()
if (eFixa) { console.error('ERRO promo fixa:', eFixa.message); process.exit(1) }

const rowsFixos = FIXOS.map(([codigo, preco]) => ({
  promocao_id: promoFixa.id,
  produto_id: porCodigo.get(codigo).id,
  preco_promocional: preco,
  quantidade_x: null,
  quantidade_y: null,
}))
const { error: eItensFixa } = await sb.from('itens_promocao').insert(rowsFixos)
if (eItensFixa) { console.error('ERRO itens fixos:', eItensFixa.message); process.exit(1) }
console.log(`OK promo fixa "${NOME_FIXOS}" com ${rowsFixos.length} itens`)

// ---------- 2) lotes de 10 (progressivo) ----------
for (const lote of LOTES) {
  await limpar(lote.nome)
  const { data: promo, error: ePromo } = await sb.from('promocoes').insert({
    nome: lote.nome,
    tipo: 'progressivo',
    valor: 0,
    data_inicio: INICIO,
    data_fim: FIM,
    ativa: true,
    descricao: `Lote de 10 unidades por ${brl(lote.lote)}. Preço unitário ${brl(lote.unidade)} quando o cliente leva 10 ou mais.`,
  }).select('id').single()
  if (ePromo) { console.error('ERRO promo lote:', ePromo.message); process.exit(1) }
  const { error: eItem } = await sb.from('itens_promocao').insert({
    promocao_id: promo.id,
    produto_id: porCodigo.get(lote.codigo).id,
    preco_promocional: 0,
    quantidade_x: null,
    quantidade_y: null,
  })
  if (eItem) { console.error('ERRO item lote:', eItem.message); process.exit(1) }
  const { error: eFaixa } = await sb.from('faixas_promocao').insert({
    promocao_id: promo.id,
    quantidade_minima: 10,
    preco: lote.unidade,
  })
  if (eFaixa) { console.error('ERRO faixa:', eFaixa.message); process.exit(1) }
  console.log(`OK promo "${lote.nome}": 10 un = ${brl(lote.lote)} (${brl(lote.unidade)}/un)`)
}

// ---------- conferência ----------
console.log('\n--- CONFERÊNCIA (como o PDV vê hoje) ---')
const { data: conferencia } = await sb.from('promocoes')
  .select('id, nome, tipo, ativa, data_inicio, data_fim')
  .like('nome', 'BLACK TECBLACK%')
for (const p of conferencia ?? []) {
  const { data: itens } = await sb.from('itens_promocao').select('produto_id, preco_promocional').eq('promocao_id', p.id)
  const { data: faixas } = await sb.from('faixas_promocao').select('quantidade_minima, preco').eq('promocao_id', p.id)
  const nomes = (itens ?? []).map((i) => porCodigo.get([...porCodigo.keys()].find((c) => porCodigo.get(c).id === i.produto_id))?.codigo ?? i.produto_id)
  console.log(`${p.ativa} ${p.tipo} ${p.data_inicio}→${p.data_fim} | ${p.nome} | itens: ${nomes.join(',')} | preços: ${(itens ?? []).map((i) => i.preco_promocional).join(',')} ${faixas?.length ? '| faixas: ' + faixas.map((f) => `${f.quantidade_minima}un=${f.preco}`).join(',') : ''}`)
}
