// CONSERTA A HORA do data_pagamento nas quitações de fiado de novembro.
//
// A RPC `receber_fiado_reais` gravava `(now() at time zone 'America/Sao_Paulo')::date` —
// data pura. Em coluna `timestamptz` isso vira meia-noite UTC, que em São Paulo é 21h do
// dia ANTERIOR: o pagamento de segunda 23/11 aparecia como domingo 22/11 (dia em que a
// loja não abre). A hora verdadeira ficou guardada no `historico_pagamentos` de cada
// baixa — é dela que este script devolve o instante.
//
// Não mexe em valor, status, forma, conta nem dia: só troca a hora 00:00 UTC pela hora
// real que já está gravada na mesma linha. Linha sem hora no histórico fica como está
// (o DIA está certo; só não existe hora para recuperar).
//
// DRY por padrão; grava com `--gravar`. Backup + DESFAZER em docs/registros-banco/.
// Uso: node scripts/consertar-hora-pagamento.mjs [2026-11] [--gravar]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GRAVAR = process.argv.includes('--gravar')
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mes = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a)) ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
const [ano, m] = mes.split('-').map(Number)
const de = `${mes}-01`
const ate = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
async function fetchAll(q) { const o = []; for (let i = 0; i < 400000; i += 1000) { const { data, error } = await q(i, i + 999); if (error) throw new Error(error.message); if (!data || !data.length) break; o.push(...data); if (data.length < 1000) break } return o }

const todos = await fetchAll((f, t) => s.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, data_pagamento, historico_pagamentos')
  .gte('data_pagamento', de).lt('data_pagamento', ate).order('id').range(f, t))

// só as linhas com data pura (meia-noite UTC) e hora real no histórico
const consertos = []
let semHora = 0
for (const l of todos) {
  const dp = l.data_pagamento ?? ''
  if (!dp.includes('T00:00:00+00')) continue
  const hist = Array.isArray(l.historico_pagamentos) ? l.historico_pagamentos : []
  const comHora = hist.filter((h) => h && typeof h.data === 'string' && !h.data.includes('T00:00:00'))
  if (!comHora.length) { semHora++; continue }
  const ultima = comHora[comHora.length - 1]
  const instante = new Date(ultima.data)
  if (Number.isNaN(instante.getTime())) { semHora++; continue }
  // só aceita se o dia (em São Paulo) for o mesmo da data pura — senão não toco
  const diaSP = instante.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  if (diaSP !== dp.slice(0, 10)) { semHora++; continue }
  consertos.push({ id: l.id, descricao: l.descricao, de: dp, para: instante.toISOString() })
}

console.log(`\n${mes} — lançamentos pagos: ${todos.length}`)
console.log(`com data_pura (meia-noite UTC): ${consertos.length + semHora}`)
console.log(`  consertáveis (hora real no histórico): ${consertos.length}`)
console.log(`  sem hora recuperável: ${semHora}  (o dia está certo; não há hora para voltar)`)
const porDia = {}
for (const c of consertos) porDia[c.de.slice(0, 10)] = (porDia[c.de.slice(0, 10)] ?? 0) + 1
console.log('  por dia (UTC):', JSON.stringify(porDia))
console.log('\n5 exemplos:')
for (const c of consertos.slice(0, 5)) console.log(`  ${c.descricao} · ${c.de} → ${c.para}`)

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado. Use --gravar.)'); process.exit(0) }

const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/hora-pagamento-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), consertos }, null, 2), 'utf8')

// A RPC impede UPDATE em lote por SQL direto? Não: é tabela comum. Vai um a um em lotes
// de 100 para o log ficar legível e o erro parar no lote certo.
let feitos = 0
for (let i = 0; i < consertos.length; i += 100) {
  const lote = consertos.slice(i, i + 100)
  for (const c of lote) {
    const { error } = await s.from('lancamentos').update({ data_pagamento: c.para }).eq('id', c.id)
    if (error) { console.error('erro em', c.id, error.message); process.exit(1) }
    feitos++
  }
  console.log(`  ... ${feitos}/${consertos.length}`)
}

const desfazer = consertos.map((c) => `UPDATE lancamentos SET data_pagamento = '${c.de}' WHERE id = '${c.id}';`).join('\n') + '\n'
fs.writeFileSync(`${dir}/DESFAZER-hora-pagamento-${carimbo}.sql`, desfazer, 'utf8')
console.log(`\n✔ ${feitos} lançamento(s) com a hora real do pagamento`)
console.log(`backup: ${dir}/hora-pagamento-antes-${carimbo}.json`)
console.log(`desfazer: ${dir}/DESFAZER-hora-pagamento-${carimbo}.sql`)
