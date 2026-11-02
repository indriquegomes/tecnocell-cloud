// READ-ONLY: as 56 notas de entrada de outubro são COMPRA ou são PAGAMENTO?
// Casa cada nota com um comprovante PIX enviado (mesmo destinatário e valor).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
async function pagina(tabela, colunas, aplicar, ordem = 'id') {
  const o = []
  for (let p = 0; ; p++) {
    let q = s.from(tabela).select(colunas)
    if (aplicar) q = aplicar(q)
    const { data, error } = await q.order(ordem).range(p * 1000, p * 1000 + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data.length) break
    o.push(...data)
    if (data.length < 1000) break
  }
  return o
}
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const L = []
const out = (t = '') => { L.push(t); console.log(t) }

const notas = await pagina('notas_entrada', 'id, numero, fornecedor_id, valor_total, data_entrada, status', (q) => q.gte('data_entrada', '2026-10-01').lt('data_entrada', '2026-11-01'))
const ids = [...new Set(notas.map((n) => n.fornecedor_id).filter(Boolean))]
const nomeFornecedor = new Map()
for (let i = 0; i < ids.length; i += 200) {
  const { data } = await s.from('pessoas').select('id, nome').in('id', ids.slice(i, i + 200))
  for (const p of data ?? []) nomeFornecedor.set(p.id, p.nome)
}
const itens = await pagina('itens_nota_entrada', 'nota_id, total_item, quantidade')
const qtdItens = new Map()
for (const it of itens) qtdItens.set(it.nota_id, (qtdItens.get(it.nota_id) ?? 0) + 1)

const pix = await pagina('comprovantes_pix', 'valor, data_pix, destinatario, extraido_raw, status, transacao_id', (q) => q.gte('data_pix', '2026-10-01').lt('data_pix', '2026-11-01'))
const pixOk = pix.filter((r) => r.status !== 'apagado' && r.status !== 'duplicado' && (r.extraido_raw?.eh_comprovante !== false) && r.destinatario)
const vistos = new Set()
const pixUnico = []
for (const r of pixOk) { const k = r.transacao_id || String(Math.random()); if (vistos.has(k)) continue; vistos.add(k); pixUnico.push(r) }

const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
function grupo(nome) {
  const n = norm(nome)
  if (/STOR ONE|H2O|H2 /.test(n)) return 'H2O'
  if (/ARMACAO LONGITUDE|ADL/.test(n)) return 'ADL'
  if (/FERNANDES DA SILVA|PLANORH|FERREIRA E FERREIRA|ZL/.test(n)) return 'ZL'
  if (/ATRATIVA|INOVA/.test(n)) return 'INOVA'
  if (/PLAY CELL|PLANETA/.test(n)) return 'PLANETA'
  if (/TROCA/.test(n)) return 'TROCA'
  return n.slice(0, 24)
}

out('# As notas de entrada de outubro — compra ou pagamento?')
out()
out(`Notas do mês: **${notas.length}** · ${brl(notas.reduce((t, n) => t + Number(n.valor_total ?? 0), 0))}`)
out(`Comprovantes PIX únicos do mês: **${pixUnico.length}** · ${brl(pixUnico.reduce((t, r) => t + Number(r.valor ?? 0), 0))}`)
out()

// casar nota × PIX por valor e dia (±1 dia)
const usados = new Set()
let casadas = 0, valorCasado = 0
const semPar = []
for (const n of notas) {
  const valor = Number(n.valor_total ?? 0)
  if (!valor) { semPar.push(n); continue }
  const idx = pixUnico.findIndex((r, i) => !usados.has(i) && Math.abs(Number(r.valor ?? 0) - valor) < 0.011 && Math.abs(new Date(r.data_pix) - new Date(n.data_entrada)) <= 86400000)
  if (idx >= 0) { usados.add(idx); casadas++; valorCasado += valor } else semPar.push(n)
}
out('| | Notas | Valor |')
out('|---|---|---|')
out(`| Casadas com um PIX de valor igual (mesmo dia ou ±1) | **${casadas}** | **${brl(valorCasado)}** |`)
out(`| Sem PIX correspondente | ${semPar.length} | ${brl(semPar.reduce((t, n) => t + Number(n.valor_total ?? 0), 0))} |`)
out()

// por fornecedor: notas × PIX
out('## Por fornecedor (nota × PIX)')
out()
out('| Grupo | Notas no app | Valor app | PIX no mês | Diferença |')
out('|---|---|---|---|---|')
const porGrupo = {}
for (const n of notas) { const g = grupo(nomeFornecedor.get(n.fornecedor_id) ?? '?'); porGrupo[g] ??= { n: 0, v: 0 }; porGrupo[g].n++; porGrupo[g].v += Number(n.valor_total ?? 0) }
const pixGrupo = {}
for (const r of pixUnico) { const g = grupo(r.destinatario); pixGrupo[g] ??= { n: 0, v: 0 }; pixGrupo[g].n++; pixGrupo[g].v += Number(r.valor ?? 0) }
const grupos = new Set([...Object.keys(porGrupo), ...Object.keys(pixGrupo)])
for (const g of [...grupos].sort((a, b) => (porGrupo[b]?.v ?? 0) - (porGrupo[a]?.v ?? 0))) {
  out(`| ${g} | ${porGrupo[g]?.n ?? 0} | ${brl(porGrupo[g]?.v ?? 0)} | ${brl(pixGrupo[g]?.v ?? 0)} | ${brl((porGrupo[g]?.v ?? 0) - (pixGrupo[g]?.v ?? 0))} |`)
}
out()

// notas sem itens e notas com número repetido
const semItens = notas.filter((n) => !qtdItens.has(n.id))
out(`- notas SEM itens: ${semItens.length}${semItens.length ? ' → ' + semItens.map((n) => `${n.data_entrada} ${brl(n.valor_total)}`).join(' · ') : ''}`)
const porNumero = {}
for (const n of notas) { const k = String(n.numero ?? 'sem'); (porNumero[k] ??= []).push(n) }
const repetidas = Object.entries(porNumero).filter(([k, arr]) => arr.length > 1 && k !== 'sem')
out(`- números de nota repetidos: ${repetidas.length}`)
for (const [k, arr] of repetidas.slice(0, 5)) out(`  - nº ${k}: ${arr.length}× → ${arr.map((n) => `${n.data_entrada} ${brl(n.valor_total)}`).join(' | ')}`)
out()

// distribuição das notas que casaram: são o mesmo valor do pagamento?
out('## Leitura')
out()
out(`Se **${casadas} de ${notas.length}** notas têm valor idêntico a um PIX de fornecedor daquele dia, a "nota de entrada"`)
out('está registrando **o pagamento**, não a compra. Nesse caso o "comprado" do app é uma cópia do "pago" e a')
out('mercadoria que entrou de verdade não está medida pelo valor — só pela quantidade que foi para o estoque.')

fs.writeFileSync('docs/fechamento/2026-10/notas-vs-pix.md', L.join('\n') + '\n', 'utf8')
console.log('\nok: docs/fechamento/2026-10/notas-vs-pix.md')
