// LIGA a conta aberta pelo "Cancelar crédito" à devolução que a originou.
//
//   node --env-file=.env.local scripts/ligar-estorno-credito.mjs            (ensaio)
//   node --env-file=.env.local scripts/ligar-estorno-credito.mjs --aplicar   (grava)
//   node --env-file=.env.local scripts/ligar-estorno-credito.mjs --desfazer <backup.json>
//
// A RPC `estornar_credito_cliente` abria a conta "Estorno de crédito — devolução
// da venda #N — Cliente" sem `devolucao_id` e sem `pessoa_id`. O conserto de
// 27/11 (migration) vale para as contas NOVAS; este script acerta as que já
// nasceram órfãs, lendo a origem de verdade:
//   creditos_clientes (tipo 'estorno') → estorna_credito_id → crédito → devolucao_id
// Só liga quando existe UMA conta com o mesmo valor e o mesmo cliente; o resto
// fica listado para conferência.
import fs from 'node:fs'
import path from 'node:path'
import { normNome } from './lib-nome-extrato.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const desfazer = args.includes('--desfazer') ? args[args.indexOf('--desfazer') + 1] : null
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const dia = (x) => String(x ?? '').slice(0, 10)

if (desfazer) {
  const itens = JSON.parse(fs.readFileSync(desfazer, 'utf8'))
  let ok = 0
  for (const it of itens) {
    const r = await fetch(`${url}/rest/v1/lancamentos?id=eq.${it.lancamento_id}`, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ devolucao_id: it.antes.devolucao_id, pessoa_id: it.antes.pessoa_id, updated_at: new Date().toISOString() }),
    })
    if (r.ok) ok++
  }
  console.log(`desfeito: ${ok} de ${itens.length}`)
  process.exit(0)
}

const estornos = await get('creditos_clientes?select=id,pessoa_id,pessoa_nome,valor,estorna_credito_id,created_at&tipo=eq.estorno&order=id&limit=2000')
console.log(`estornos de crédito no histórico: ${estornos.length}\n`)

const ligar = []
const semConta = []
const jaLigada = []

for (const e of estornos) {
  if (!e.estorna_credito_id) { semConta.push({ e, motivo: 'estorno sem crédito de origem' }); continue }
  const [credito] = await get(`creditos_clientes?id=eq.${e.estorna_credito_id}&select=id,pessoa_id,pessoa_nome,valor,devolucao_id`)
  if (!credito?.devolucao_id) continue // crédito que não veio de devolução: não há o que ligar

  // A conta aberta pelo estorno se chama "Estorno de crédito — …", mas quando o
  // reembolso foi lançado à mão ela pode estar como "Devolução — …". As duas contam.
  const contas = await get(`lancamentos?select=id,descricao,pessoa_nome,pessoa_id,valor,devolucao_id,status&tipo=eq.pagar&valor=eq.${Number(e.valor)}&status=eq.pago&or=(descricao.ilike.Estorno*,descricao.ilike.Devolu*)&limit=50`)
  // mesma devolução, mesmo valor, mesma pessoa — a conta pode já estar certa
  const daDev = contas.filter((c) => c.devolucao_id === credito.devolucao_id)
  if (daDev.length) { jaLigada.push({ e, conta: daDev[0] }); continue }

  // Conta lançada à mão costuma vir sem `pessoa_nome` — o nome fica só na
  // descrição ("Devolução — ALVARO GARCIA (estorno de compra)"). Nas duas formas
  // o cliente é o mesmo do estorno.
  const nomeDaConta = (c) => String(c.pessoa_nome ?? '').trim()
    || String(c.descricao ?? '').replace(/^[^—–-]*[—–-]\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim()
  const soltas = contas.filter((c) => !c.devolucao_id && normNome(nomeDaConta(c)) === normNome(e.pessoa_nome))
  if (soltas.length === 1) ligar.push({ e, conta: soltas[0], devolucao_id: credito.devolucao_id, pessoa_id: credito.pessoa_id })
  else semConta.push({ e, motivo: soltas.length ? `${soltas.length} contas soltas do valor` : 'nenhuma conta solta do valor' })
}

// Uma conta só pode apontar para UMA devolução. Se dois estornos do mesmo valor
// caíram na mesma conta (o caso RODRIGO PEREIRA, três estornos e uma conta), o
// par não é prova — fica fora.
const porConta = new Map()
for (const x of ligar) porConta.set(x.conta.id, (porConta.get(x.conta.id) ?? 0) + 1)
for (const x of [...ligar]) {
  if (porConta.get(x.conta.id) > 1) {
    ligar.splice(ligar.indexOf(x), 1)
    semConta.push({ e: x.e, motivo: `${porConta.get(x.conta.id)} estornos disputando a mesma conta` })
  }
}

console.log(`=== LIGAR (conta órfã com origem provada): ${ligar.length} ===`)
for (const x of ligar) {
  console.log(`  ${dia(x.e.created_at)} · ${brl(x.e.valor).padEnd(10)} · ${String(x.e.pessoa_nome).slice(0, 26).padEnd(26)} → dev ${x.devolucao_id.slice(0, 8)} · conta ${x.conta.id.slice(0, 8)} (${x.conta.status})`)
}
console.log(`\n=== JÁ LIGADAS: ${jaLigada.length} ===`)
for (const x of jaLigada) console.log(`  ${dia(x.e.created_at)} · ${brl(x.e.valor)} · ${x.e.pessoa_nome}`)
console.log(`\n=== FORA (sem par seguro): ${semConta.length} ===`)
for (const x of semConta) console.log(`  ${dia(x.e.created_at)} · ${brl(x.e.valor).padEnd(10)} · ${x.e.pessoa_nome} · ${x.motivo}`)

if (!aplicar) { console.log(`\n(ensaio: nada gravado. --aplicar liga as ${ligar.length}.)`); process.exit(0) }

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `ligar-estorno-credito-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify(ligar.map((x) => ({
  lancamento_id: x.conta.id, valor: x.conta.valor, descricao: x.conta.descricao,
  devolucao_id: x.devolucao_id, pessoa_id: x.pessoa_id,
  antes: { devolucao_id: x.conta.devolucao_id ?? null, pessoa_id: x.conta.pessoa_id ?? null },
})), null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

let ok = 0
for (const x of ligar) {
  const r = await fetch(`${url}/rest/v1/lancamentos?id=eq.${x.conta.id}`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ devolucao_id: x.devolucao_id, pessoa_id: x.pessoa_id, updated_at: new Date().toISOString() }),
  })
  if (r.ok) ok++
  else console.log(`  falhou ${x.conta.id}: ${(await r.text()).slice(0, 120)}`)
}
console.log(`ligadas: ${ok} de ${ligar.length}`)
