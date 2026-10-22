// Conferência READ-ONLY da dívida de fiado por cliente (nada é gravado).
// Regra usada nas telas: dívida = lançamentos tipo 'receber' + status 'pendente',
// e o dono é `pessoa_id` da nota ou, quando a nota é antiga e não tem pessoa_id,
// a pessoa da VENDA ligada a ela (é assim que a tela Fiados agrupa).
//
// Uso:  node scripts/conferir-fiado-por-cliente.mjs
//
// Serve pra responder duas perguntas sem abrir o app:
//   1. Quanto há em aberto no total, e quanto disso ficou sem dono identificável
//      (esses não aparecem em nenhum cadastro de cliente — só na tela Fiados).
//   2. As notas antigas que só se ligam ao cliente pela venda ainda resolvem?
//      Se esse número cair pra zero sem motivo, alguma coisa parou de ligar.
// Não imprime nome, telefone nem documento: só agregados.
import fs from 'node:fs'
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
  for (let from = 0; from < 500000; from += PAGINA) {
    const { data, error } = await fazer(from, from + PAGINA - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGINA) break
  }
  return out
}

const pendentes = await tudo((from, to) => s.from('lancamentos')
  .select('id, valor, valor_pago, pessoa_id, venda_id')
  .eq('tipo', 'receber').eq('status', 'pendente').order('id').range(from, to))

const semPessoa = pendentes.filter((l) => !l.pessoa_id && l.venda_id)
const vendaIds = [...new Set(semPessoa.map((l) => l.venda_id))]
const pessoaDaVenda = new Map()
for (let i = 0; i < vendaIds.length; i += 200) {
  const { data } = await s.from('vendas').select('id, pessoa_id').in('id', vendaIds.slice(i, i + 200))
  for (const v of data ?? []) pessoaDaVenda.set(v.id, v.pessoa_id)
}

let total = 0
let orfas = 0
let valorOrfas = 0
let porVenda = 0
const porCliente = new Map()
for (const l of pendentes) {
  const restante = (l.valor ?? 0) - (l.valor_pago ?? 0)
  total += restante
  const dono = l.pessoa_id ?? (l.venda_id ? pessoaDaVenda.get(l.venda_id) : null) ?? null
  if (!dono) { orfas++; valorOrfas += restante; continue }
  if (!l.pessoa_id) porVenda++
  porCliente.set(dono, (porCliente.get(dono) ?? 0) + restante)
}

const ordenado = [...porCliente.entries()].sort((a, b) => b[1] - a[1])
console.log('Dívida pendente total: R$ ' + total.toFixed(2) + ' em ' + pendentes.length + ' nota(s)')
console.log('  devedores distintos: ' + ordenado.length)
console.log('  notas ligadas ao cliente só pela venda (sem pessoa_id): ' + porVenda)
console.log('  notas SEM dono identificável: ' + orfas + ' (R$ ' + valorOrfas.toFixed(2) + ') — aparecem só na tela Fiados')
console.log('  maior dívida: R$ ' + (ordenado[0]?.[1] ?? 0).toFixed(2) + ' | 5 maiores somam R$ ' +
  ordenado.slice(0, 5).reduce((a, [, v]) => a + v, 0).toFixed(2))
if (valorOrfas > 0) {
  console.log('')
  console.log('⚠️  Notas sem dono não entram no cadastro de nenhum cliente. Pra ligar:')
  console.log('    vincular a nota a uma venda com cliente, ou preencher pessoa_id.')
}
