// LIGA EM LOTE as contas "Devolução — X" que ficaram sem devolução. SÓ LÊ + vincula.
//
//   node --env-file=.env.local scripts/ligar-devolucoes-soltas.mjs            (ensaio)
//   node --env-file=.env.local scripts/ligar-devolucoes-soltas.mjs --aplicar   (grava)
//
// Para cada conta a pagar paga cuja descrição é devolução e que está SEM
// `devolucao_id`, procura a devolução que casa:
//   - mesmo valor (±1 centavo)
//   - data a até 10 dias
//   - nome do cliente casando (nomeContido, a régua estrita)
// Se achar UMA só, liga. Se achar várias ou nenhuma, não toca e lista.
//
// Não muda valor, forma, conta, status nem o tipo da devolução.
import fs from 'node:fs'
import path from 'node:path'
import { nomeContido, mesmoNome, normNome } from './lib-nome-extrato.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const dia = (x) => String(x ?? '').slice(0, 10)
const dif = (a, b) => (a && b ? Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000) : 999)
const JANELA = 10

const nomeDe = (l) => String(l.pessoa_nome ?? '').trim() ||
  String(l.descricao ?? '').replace(/^(Devolu[çc][ãa]o|Estorno de cr[ée]dito)[^—–-]*[—–-]\s*/i, '').replace(/\s*\(.*\)\s*$/, '').trim()

const soltas = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,forma_pagamento,conta_id,data_pagamento&tipo=eq.pagar&descricao=ilike.Devolu*&devolucao_id=is.null&data_pagamento=gte.2026-11-01&order=data_pagamento&limit=200`)
console.log(`contas de devolução soltas: ${soltas.length}\n`)

const ligar = []
const semPar = []
const ambiguas = []

for (const l of soltas) {
  const nome = nomeDe(l)
  const devs = await get(`devolucoes?select=id,valor_total,pessoa_nome,created_at&valor_total=eq.${Number(l.valor)}&created_at=gte.2026-10-20&limit=200`)
  const perto = devs.filter((d) => dif(dia(d.created_at), dia(l.data_pagamento)) <= JANELA)
  const porNome = perto.filter((d) => mesmoNome(nome, d.pessoa_nome) || nomeContido(nome, d.pessoa_nome))
  if (porNome.length === 1) ligar.push({ l, dev: porNome[0], nome })
  else if (porNome.length > 1) ambiguas.push({ l, nome, candidatas: porNome })
  else semPar.push({ l, nome, perto: perto.length })
}

console.log(`=== LIGAR (devolução única, nome casando): ${ligar.length} ===`)
for (const x of ligar) console.log(`  ${dia(x.l.data_pagamento)} · ${brl(x.l.valor).padEnd(10)} · ${x.nome.slice(0, 28).padEnd(28)} → dev ${x.dev.id.slice(0, 8)} · ${x.dev.pessoa_nome.slice(0, 26)} · ${dia(x.dev.created_at)}`)
console.log(`\n=== AMBÍGUAS (fica fora): ${ambiguas.length} ===`)
for (const x of ambiguas) console.log(`  ${dia(x.l.data_pagamento)} · ${brl(x.l.valor)} · ${x.nome} → ${x.candidatas.map((d) => dia(d.created_at) + ' ' + d.pessoa_nome).join(' | ')}`)
console.log(`\n=== SEM DEVOLUÇÃO (conta solta de verdade): ${semPar.length} ===`)
for (const x of semPar) console.log(`  ${dia(x.l.data_pagamento)} · ${brl(x.l.valor).padEnd(10)} · ${x.nome.slice(0, 32)} · ${x.perto} devolução(ões) do valor na janela, nenhuma no nome`)

if (!aplicar) { console.log(`\n(ensaio: nada gravado. --aplicar liga as ${ligar.length}.)`); process.exit(0) }

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `ligar-devolucoes-soltas-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify(ligar.map((x) => ({ lancamento_id: x.l.id, valor: x.l.valor, nome_no_lancamento: x.nome, devolucao_id: x.dev.id, devolucao_nome: x.dev.pessoa_nome, devolucao_data: dia(x.dev.created_at), antes: { devolucao_id: null } })), null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)
let ok = 0
for (const x of ligar) {
  const r = await fetch(`${url}/rest/v1/lancamentos?id=eq.${x.l.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ devolucao_id: x.dev.id, updated_at: new Date().toISOString() }) })
  if (r.ok) ok++
  else console.log(`  falhou ${x.l.id}: ${(await r.text()).slice(0, 100)}`)
}
console.log(`ligadas: ${ok} de ${ligar.length}`)
