// SÓ LEITURA — replica exata do cálculo de "vale" da tela de Fiados, para achar por que
// AD CELL BINGEN aparece com R$ 36,00 quando o extrato dá R$ 18,00.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function fetchAll(q) { const o = []; for (let i = 0; i < 500000; i += 1000) { const { data, error } = await q(i, i + 999); if (error) throw new Error(error.message); if (!data || !data.length) break; o.push(...data); if (data.length < 1000) break } return o }
async function fetchAllIn(ids, make, chunkSize = 200) { const o = []; for (let i = 0; i < ids.length; i += chunkSize) { const chunk = ids.slice(i, i + chunkSize); const rows = await fetchAll((from, to) => make(chunk, from, to)); o.push(...rows) } return o }
const semAcento = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
const dia = (x) => (x ?? '').slice(0, 10)

const ALVO = 'BINGEN'

// 1) a query da página
const lanc = await fetchAll((from, to) => s.from('lancamentos')
  .select('id, codigo, descricao, pessoa_nome, pessoa_id, valor, valor_pago, data_vencimento, venda_id, loja_id, categoria, created_at')
  .eq('tipo', 'receber').eq('status', 'pendente').order('id').range(from, to))
console.log('lançamentos pendentes (query da página): ' + lanc.length)

// 2) vendas → caixa → loja e pessoa da venda
const vendaIds = [...new Set(lanc.map((l) => l.venda_id).filter(Boolean))]
const vendaInfo = new Map()
const lotes = []
for (let i = 0; i < vendaIds.length; i += 100) lotes.push(vendaIds.slice(i, i + 100))
for (const lote of lotes) {
  const { data } = await s.from('vendas').select('id, caixa_id, pessoa_id').in('id', lote)
  for (const v of data ?? []) vendaInfo.set(v.id, v)
}
const caixaIds = [...new Set([...vendaInfo.values()].map((v) => v.caixa_id).filter(Boolean))]
const { data: caixas } = caixaIds.length ? await s.from('caixas').select('id, loja_id').in('id', caixaIds) : { data: [] }
const caixaDe = new Map((caixas ?? []).map((c) => [c.id, c.loja_id]))
const { data: lojas } = await s.from('lojas').select('id, nome')
const nomeLoja = new Map((lojas ?? []).map((l) => [l.id, l.nome]))

// 3) agrupa como a página
const mapa = new Map()
for (const l of lanc) {
  const nome = l.pessoa_nome?.trim() || 'Sem nome'
  const devendo = (l.valor ?? 0) - (l.valor_pago ?? 0)
  if (devendo <= 0.01) continue
  const chave = semAcento(nome)
  const atual = mapa.get(chave) ?? { nome, total: 0, qtd: 0, notas: [], pessoasLojas: new Set() }
  const venda = l.venda_id ? vendaInfo.get(l.venda_id) : null
  const lojaId = (l.loja_id && nomeLoja.has(l.loja_id) ? l.loja_id : null) ?? (venda?.caixa_id ? caixaDe.get(venda.caixa_id) : null) ?? null
  const pessoaId = l.pessoa_id || venda?.pessoa_id || null
  if (pessoaId && lojaId) atual.pessoasLojas.add(`${pessoaId}|${lojaId}`)
  atual.total += devendo
  atual.qtd += 1
  atual.notas.push({ id: l.id, venc: dia(l.data_vencimento), devendo, pessoaId, lojaId })
  mapa.set(chave, atual)
}
// 4) créditos como a página
const paresVale = new Set()
for (const c of mapa.values()) for (const k of c.pessoasLojas) paresVale.add(k)
const pessoaIdsVale = [...new Set([...paresVale].map((k) => k.split('|')[0]).filter(Boolean))]
console.log('pares pessoa|loja: ' + paresVale.size + ' · pessoas: ' + pessoaIdsVale.length)
const creditos = await fetchAllIn(pessoaIdsVale, (chunk, from, to) => s.from('creditos_clientes')
  .select('pessoa_id, loja_id, tipo, valor').in('pessoa_id', chunk).range(from, to))
console.log('créditos trazidos: ' + creditos.length)
const valePorPessoaLoja = {}
for (const c of creditos) {
  const k = `${c.pessoa_id}|${c.loja_id ?? ''}`
  const v = (c.tipo === 'uso' || c.tipo === 'estorno') ? -(c.valor ?? 0) : (c.valor ?? 0)
  valePorPessoaLoja[k] = (valePorPessoaLoja[k] ?? 0) + v
}

// 5) o cliente alvo
for (const [chave, c] of mapa) {
  if (!chave.includes(ALVO)) continue
  const vale = [...c.pessoasLojas].reduce((t, k) => t + (valePorPessoaLoja[k] ?? 0), 0)
  console.log(`\n=== ${c.nome} ===`)
  console.log(`  notas em aberto: ${c.qtd} · total R$ ${brl(c.total)}`)
  console.log(`  chaves pessoa|loja: ${[...c.pessoasLojas].map((k) => k.split('|')[0].slice(0, 8) + '|' + (nomeLoja.get(k.split('|')[1]) ?? k.split('|')[1] ?? '—')).join(' · ')}`)
  for (const k of c.pessoasLojas) console.log(`    ${k.split('|')[0].slice(0, 8)}|${nomeLoja.get(k.split('|')[1]) ?? '—'} → crédito R$ ${brl(valePorPessoaLoja[k] ?? 0)}`)
  console.log(`  VALE pela conta da tela: R$ ${brl(Math.max(0, vale))}`)
  console.log('  notas:')
  for (const n of c.notas) console.log(`    ${n.venc} R$ ${brl(n.devendo).padStart(8)} pessoa=${(n.pessoaId ?? 'null').slice(0, 8)} loja=${nomeLoja.get(n.lojaId) ?? '—'}`)
}
