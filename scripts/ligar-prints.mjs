// LIGA OS PRINTS DE PIX ENVIADO ÀS CONTAS DO FINANCEIRO.
//
//   node --env-file=.env.local scripts/ligar-prints.mjs "<prints-lidos.json>"            (ensaio: só mostra)
//   node --env-file=.env.local scripts/ligar-prints.mjs "<prints-lidos.json>" --aplicar  (grava)
//
// O que este script faz: grava em `pix_saidas` o comprovante (valor, dia, recebedor,
// ID E2E) LIGADO ao lançamento de devolução que ele pagou. Só isso. Não muda status,
// valor, forma nem conta do Financeiro — dinheiro continua na mão de quem opera a tela.
//
// Regra de decisão (a mesma do robô: só o inequívoco entra sozinho):
//   nome do print casa com o cliente do app, e é UM só  → liga
//   nome não casa mas só EXISTE um lançamento com esse valor e data → liga (marcado)
//   mais de um candidato, ou nenhum → não liga, entra na lista de "conferir à mão"
import fs from 'node:fs'
import path from 'node:path'
import { mesmoNome, nomeDoLancamento, normNome } from './lib-nome-extrato.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const arquivo = process.argv[2]
const aplicar = process.argv.includes('--aplicar')
if (!arquivo) { console.error('uso: scripts/ligar-prints.mjs "<prints-lidos.json>" [--aplicar]'); process.exit(1) }
const DIAS = 5
const CHAT = -5426608502 // grupo "Tecnocell Estorno pix" — prints importados do WhatsApp
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const dia = (x) => String(x ?? '').slice(0, 10)
const dif = (a, b) => (a && b ? Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000) : 999)
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()

function dataDoE2E(id) {
  const m = String(id ?? '').match(/^E\d{8}(\d{8})/)
  if (!m) return null
  const d = m[1]
  const ano = +d.slice(0, 4), mes = +d.slice(4, 6), dda = +d.slice(6, 8)
  if (ano < 2020 || ano > 2035 || mes < 1 || mes > 12 || dda < 1 || dda > 31) return null
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

const prints = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  .filter((p) => p.tipo === 'pix_enviado' && Number(p.valor) > 0)
  .map((p) => ({ ...p, data: p.data ?? dataDoE2E(p.transacao_id) }))
  .filter((p) => p.data)

console.log(`\n=== PRINTS COM VALOR E DATA: ${prints.length} ===`)

const app = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,forma_pagamento,conta_id,data_pagamento,devolucao_id&tipo=eq.pagar&status=eq.pago&or=(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)&limit=2000`)
// o que já tem prova (com ID de transação) não é ligado de novo
const comProva = await get(`pix_saidas?select=lancamento_id,transacao_id&lancamento_id=not.is.null&limit=2000`)
const provados = new Set((comProva ?? []).filter((x) => x.transacao_id).map((x) => x.lancamento_id))

const ligar = []
const conferir = []
const jaLigados = []
const usados = new Set()

for (const p of prints) {
  const cands = app.filter((l) => Math.abs(Number(l.valor) - Number(p.valor)) < 0.011 && dif(dia(l.data_pagamento), p.data) <= DIAS)
  const porNome = cands.filter((l) => mesmoNome(p.destinatario, nomeDoLancamento(l)))
  let alvo = null, modo = null
  if (porNome.length === 1) { alvo = porNome[0]; modo = 'nome' }
  else if (porNome.length === 0 && cands.length === 1) { alvo = cands[0]; modo = 'valor único' }
  if (!alvo) { conferir.push({ p, motivo: porNome.length > 1 ? `${porNome.length} com o mesmo nome` : cands.length ? `${cands.length} com o mesmo valor` : 'nenhuma conta com esse valor' }); continue }
  if (provados.has(alvo.id) || usados.has(alvo.id)) { jaLigados.push({ p, l: alvo }); continue }
  usados.add(alvo.id)
  ligar.push({ p, l: alvo, modo })
}

console.log(`\n=== PARA LIGAR: ${ligar.length} · ${brl(ligar.reduce((s, x) => s + Number(x.p.valor), 0))} ===`)
for (const x of ligar.sort((a, b) => a.p.data.localeCompare(b.p.data))) {
  const l = x.l
  const conta = l.conta_id ? 'PagBank' : '⚠️ sem conta'
  console.log(`  ${x.p.data} · ${brl(x.p.valor)} · ${String(x.p.destinatario ?? '?').slice(0, 30)} → ${nomeDoLancamento(l).slice(0, 28)} · ${l.forma_pagamento} · ${conta} · [${x.modo}]`)
}
console.log(`\n=== JÁ TINHAM PROVA (ou print repetido): ${jaLigados.length} ===`)
for (const x of jaLigados) console.log(`  · ${x.p.data} · ${brl(x.p.valor)} · print→${String(x.p.destinatario ?? '?').slice(0, 26)} | app→${nomeDoLancamento(x.l).slice(0, 26)}`)
console.log(`\n=== CONFERIR À MÃO: ${conferir.length} ===`)
for (const x of conferir.sort((a, b) => a.p.data.localeCompare(b.p.data))) {
  console.log(`  ✖ ${x.p.data} · ${brl(x.p.valor)} · print→${String(x.p.destinatario ?? '?').slice(0, 30)} — ${x.motivo}`)
}

if (!aplicar) {
  console.log(`\n(ensaio: nada foi gravado. Rode com --aplicar para ligar os ${ligar.length}.)`)
  process.exit(0)
}

// ---------- grava ----------
const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const backup = path.join(dir, `ligar-prints-${Date.now()}.json`)
fs.writeFileSync(backup, JSON.stringify(ligar.map((x) => ({ lancamento_id: x.l.id, valor: x.l.valor, cliente: x.l.pessoa_nome, devolucao_id: x.l.devolucao_id, print: x.p, modo: x.modo })), null, 2), 'utf8')
console.log(`\nbackup do que vai ser ligado: ${backup}`)

let ok = 0
for (const x of ligar) {
  const corpo = {
    telegram_chat_id: CHAT,
    telegram_user_nome: 'Importação — 48 prints do WhatsApp',
    formato: 'foto',
    recebido_em: new Date().toISOString(),
    valor: Number(x.p.valor),
    dia: x.p.data,
    pagador: x.p.pagador ?? null,
    destinatario: x.p.destinatario ?? null,
    transacao_id: x.p.transacao_id ?? null,
    status: 'casado',
    lancamento_id: x.l.id,
    conciliado_em: new Date().toISOString(),
    conciliado_por: 'importação de prints',
    extraido_raw: { arquivo: x.p.arquivo, modo: x.modo, leitura: x.p },
  }
  const r = await fetch(`${url}/rest/v1/pix_saidas`, { method: 'POST', headers: h, body: JSON.stringify(corpo) })
  if (r.ok) ok++
  else console.log(`  falhou ${x.p.arquivo}: ${(await r.text()).slice(0, 120)}`)
}
console.log(`\nligados: ${ok} de ${ligar.length}`)
