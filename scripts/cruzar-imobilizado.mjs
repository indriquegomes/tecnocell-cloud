// Cruzamento do imobilizado do grupo de WhatsApp (contagem a custo por categoria)
// com o estoque do app RECONSTRUÍDO na mesma data. READ-ONLY.
//
// Como o app é reconstruído: cada movimento em movimentacoes_estoque guarda
// qtd_anterior e qtd_nova. Então, para uma data t, a quantidade naquele momento é
//   - qtd_anterior do PRIMEIRO movimento depois de t, se existir;
//   - a quantidade atual, se não houve movimento depois de t.
// Nada de soma de sinal — usa o valor gravado na hora.
//
// Uso:  node scripts/cruzar-imobilizado.mjs 2026-10
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PAGINA = 1000
async function tudo(fazer) {
  const out = []
  for (let from = 0; from < 900000; from += PAGINA) {
    const { data, error } = await fazer(from, from + PAGINA - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGINA) break
  }
  return out
}

const mes = process.argv[2] || '2026-10'
const candidatos = [
  path.join('docs', 'fechamento', mes, 'entrada', 'whatsapp-estoque', '_chat.txt'),
  path.join('docs', 'fechamento', '2026-10', 'entrada', 'whatsapp-estoque', '_chat.txt'),
]
const chatPath = candidatos.find((p) => fs.existsSync(p))
if (!chatPath) { console.error('chat não encontrado: ' + candidatos.join(' | ')); process.exit(1) }
const txt = fs.readFileSync(chatPath, 'utf8')

// ── 1. parse do chat ────────────────────────────────────────────────────────
const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const dinheiro = /(\d{1,3}(?:\.\d{3})*,\d{2})/

// Fora da conferência por decisão do dono (25/10): itens avulsos sem custo, erro que
// veio do app antigo. Não existem no TecnoCell e não entram na conta.
const IGNORAR = new Set(['BISCOITOS', 'CHOCOLATES'])

const blocos = []
{
  const linhas = txt.split(/\r?\n/)
  let atual = null
  for (const linha of linhas) {
    const head = linha.match(/^‎?\[(\d{4}-\d{2}-\d{2}), [\d:]+\] ([^:]+): (.*)$/)
    if (head) {
      if (atual?.texto?.some((l) => /IMOBILIZADO/i.test(l))) blocos.push(atual)
      atual = { data: head[1], autor: head[2], texto: [head[3]] }
    } else if (atual && linha.trim()) {
      atual.texto.push(linha)
    }
  }
  if (atual?.texto?.some((l) => /IMOBILIZADO/i.test(l))) blocos.push(atual)
}

const contagens = [] // { data, loja, categorias: {CAT: valor}, total: n|null }
for (const b of blocos) {
  // Uma mensagem pode ter as DUAS filiais (ex.: "FINALIZAÇÃO 30/08"). A filial muda
  // quando uma linha cita Petrópolis/Teresópolis sem valor — então fecha o segmento.
  let loja = null
  let categorias = {}
  let total = null
  const fecha = () => {
    if (loja && Object.keys(categorias).length) contagens.push({ data: b.data, loja, categorias, total })
    categorias = {}
    total = null
  }
  for (const linha of b.texto) {
    const texto = linha.replace(/\t+/g, ' ')
    if (!dinheiro.test(texto)) {
      const petr = /petr[oó]polis/i.test(texto)
      const tere = /teres[oó]polis/i.test(texto)
      if (petr || tere) {
        const nova = tere && !petr ? 'Teresópolis' : 'Petrópolis'
        if (nova !== loja) { fecha(); loja = nova }
      }
      continue
    }
    const ms = [...texto.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)]
    if (!ms.length) continue
    const rotulo = norm(texto.replace(/^[\s*\-•●>:]+/, '').split('R$')[0])
      .replace(/[\s\-:>]+$/, '')
      .replace(/^\(SEM CATEGORIA\)$/, 'SEM CATEGORIA')
    // linha só com valor ("*R$ 206.689,14*") ou "TOTAL ..." = total do bloco, não categoria
    if (!rotulo || /IMOBILIZADO|FILIAL|TOTAL/.test(rotulo)) {
      if (total === null) total = Number(ms[0][1].replace(/\./g, '').replace(',', '.'))
      continue
    }
    // linha "LCD   R$ 193,50   R$ 1.033,00" → o valor da categoria é o primeiro
    const valor = Number(ms[rotulo === 'LCD' && ms.length > 1 ? 0 : ms.length - 1][1].replace(/\./g, '').replace(',', '.'))
    if (IGNORAR.has(rotulo)) continue
    categorias[rotulo] = (categorias[rotulo] ?? 0) + valor
  }
  fecha()
}

// ── 2. estoque do app reconstruído numa data ────────────────────────────────
const [{ data: lojas }, depositos, produtos, estoque] = await Promise.all([
  s.from('lojas').select('id, nome'),
  tudo((from, to) => s.from('depositos').select('id, loja_id').range(from, to)),
  tudo((from, to) => s.from('produtos').select('id, preco_custo, categorias(nome)').range(from, to)),
  tudo((from, to) => s.from('estoque').select('produto_id, deposito_id, quantidade').range(from, to)),
])
const lojaDoDeposito = new Map(depositos.map((d) => [d.id, lojas.find((l) => l.id === d.loja_id)?.nome ?? null]))
const produtoDe = new Map(produtos.map((p) => [p.id, { custo: Number(p.preco_custo ?? 0), categoria: norm(p.categorias?.nome ?? '(SEM CATEGORIA)') }]))

const movs = await tudo((from, to) => s.from('movimentacoes_estoque')
  .select('produto_id, deposito_id, qtd_anterior, qtd_nova, created_at')
  .gte('created_at', '2026-08-01T00:00:00-03:00').order('created_at').range(from, to))

async function estoquePorCategoriaEm(data) {
  const corte = data + 'T23:59:59-03:00'
  // primeiro movimento DEPOIS do corte, por produto+depósito
  const depois = new Map()
  for (const m of movs) {
    if (m.created_at <= corte) continue
    const k = m.produto_id + '|' + m.deposito_id
    if (!depois.has(k)) depois.set(k, m) // já ordenado por created_at
  }
  const atual = new Map()
  for (const e of estoque) atual.set(e.produto_id + '|' + e.deposito_id, e.quantidade ?? 0)

  const out = { Petrópolis: {}, Teresópolis: {} }
  const chaves = new Set([...atual.keys(), ...depois.keys()])
  for (const k of chaves) {
    const [produtoId, depositoId] = k.split('|')
    const loja = lojaDoDeposito.get(depositoId)
    if (!loja || !out[loja]) continue
    const qtd = depois.has(k) ? Number(depois.get(k).qtd_anterior ?? 0) : Number(atual.get(k) ?? 0)
    if (!qtd) continue
    const p = produtoDe.get(produtoId)
    if (!p) continue
    out[loja][p.categoria] = (out[loja][p.categoria] ?? 0) + qtd * p.custo
  }
  return out
}

// ── 3. comparação ───────────────────────────────────────────────────────────
const alvo = contagens.filter((c) => c.data.startsWith(mes)).sort((a, b) => a.data.localeCompare(b.data))
const brl = (n) => 'R$ ' + (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const linhas = ['# Cruzamento imobilizado (papel) × estoque do app na mesma data', '', `Mês: ${mes}`, '']
const resumo = []

for (const c of alvo) {
  const app = await estoquePorCategoriaEm(c.data)
  const cats = new Set([...Object.keys(c.categorias), ...Object.keys(app[c.loja] ?? {})])
  const t = { papel: 0, app: 0 }
  const linhasCat = []
  for (const cat of [...cats].sort()) {
    const papel = c.categorias[cat] ?? 0
    const appV = app[c.loja]?.[cat] ?? 0
    t.papel += papel
    t.app += appV
    if (Math.abs(papel - appV) >= 1) linhasCat.push({ cat, papel, app: appV, dif: appV - papel })
  }
  linhas.push(`## ${c.data} — ${c.loja}`, '')
  linhas.push(`- Papel: **${brl(t.papel)}** (total declarado no chat: ${c.total ? brl(c.total) : '—'})`)
  linhas.push(`- App na mesma data: **${brl(t.app)}** · diferença **${brl(t.app - t.papel)}**`, '')
  if (linhasCat.length) {
    linhas.push('| Categoria | Papel | App | Diferença |', '|---|---|---|---|')
    for (const l of linhasCat.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))) linhas.push(`| ${l.cat} | ${brl(l.papel)} | ${brl(l.app)} | ${l.dif > 0 ? '+' : ''}${brl(l.dif)} |`)
  } else linhas.push('_Bate categoria por categoria._')
  linhas.push('')
  resumo.push({ data: c.data, loja: c.loja, papel: t.papel, app: t.app, dif: t.app - t.papel, cats: linhasCat.length })
}

const dir = path.join('docs', 'fechamento', mes, 'entrada')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, '03-cruzamento-imobilizado.md'), linhas.join('\n'), 'utf8')

console.log('data        loja          papel         app           diferença')
for (const r of resumo) {
  console.log(`${r.data}  ${r.loja.padEnd(12)} ${brl(r.papel).padStart(14)} ${brl(r.app).padStart(14)} ${brl(r.dif).padStart(14)}   (${r.cats} categorias fora)`)
}
console.log(`\nok: ${path.join(dir, '03-cruzamento-imobilizado.md')}`)
