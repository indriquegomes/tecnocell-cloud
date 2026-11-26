// PRINTS × ESTORNOS DO APP. SÓ LÊ.
//
//   node --env-file=.env.local scripts/cruzar-prints-estornos.mjs "<prints-lidos.json>"
//
// Os prints são a única prova quando o PIX saiu para conta de TERCEIRO (o nome no
// extrato não é o cliente). Este script pega cada comprovante lido e procura a
// devolução/estorno correspondente no app por valor, data próxima e nome — do
// recebedor OU do cliente do cartão.
//
// Saída: cada print com o que achou, e a lista do que sobrou dos dois lados.
import fs from 'node:fs'
import { mesmoNome, nomeDoLancamento } from './lib-nome-extrato.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const arquivo = process.argv[2]
if (!arquivo) { console.error('uso: scripts/cruzar-prints-estornos.mjs "<prints-lidos.json>"'); process.exit(1) }
const DIAS = Number(process.argv[3] ?? 5)
const h = { apikey: key, Authorization: `Bearer ${key}` }
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const dia = (x) => String(x ?? '').slice(0, 10)
const dif = (a, b) => (a && b ? Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000) : 999)

const prints = JSON.parse(fs.readFileSync(arquivo, 'utf8'))
  .filter((p) => p.tipo === 'pix_enviado')
  .filter((p) => Number(p.valor) > 0)
  .map((p) => ({ ...p, data: p.data ?? dataDoE2E(p.transacao_id) }))

// O ID E2E carrega a data: E + 8 dígitos do banco + AAAAMMDD + HHMM + resto.
// Quando a IA não lê a data na imagem, é daqui que ela sai.
function dataDoE2E(id) {
  const m = String(id ?? '').match(/^E\d{8}(\d{8})/)
  if (!m) return null
  const d = m[1], ano = +d.slice(0, 4), mes = +d.slice(4, 6), dia = +d.slice(6, 8)
  if (ano < 2020 || ano > 2035 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
}

const app = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,forma_pagamento,conta_id,data_pagamento,devolucao_id&tipo=eq.pagar&status=eq.pago&or=(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)&limit=2000`)

console.log(`\n=== PRINTS DE PIX ENVIADO LIDOS: ${prints.length} · ${brl(prints.reduce((s, p) => s + Number(p.valor), 0))} ===`)

const usados = new Set()
const casados = []
const sozinho = []
for (const p of prints) {
  // 1) mesmo valor + data próxima; 2) nome do recebedor OU do E2E repetido no app
  const cand = app
    .filter((l) => !usados.has(l.id) && Math.abs(Number(l.valor) - Number(p.valor)) < 0.011 && dif(dia(l.data_pagamento), p.data) <= DIAS)
    .sort((a, b) => {
      const na = mesmoNome(p.destinatario, nomeDoLancamento(a)) ? 0 : 1
      const nb = mesmoNome(p.destinatario, nomeDoLancamento(b)) ? 0 : 1
      return na - nb
    })
  const melhor = cand[0]
  if (melhor) { usados.add(melhor.id); casados.push({ p, l: melhor, porNome: mesmoNome(p.destinatario, nomeDoLancamento(melhor)) }) }
  else sozinho.push(p)
}

console.log(`\n=== PRINT COM ESTORNO NO APP: ${casados.length} · ${brl(casados.reduce((s, x) => s + Number(x.p.valor), 0))} ===`)
for (const c of casados.sort((a, b) => String(a.p.data).localeCompare(String(b.p.data)))) {
  const marca = c.porNome ? '✔ nome' : '≈ só valor/data'
  const l = c.l
  const conta = l.conta_id ? 'PagBank' : 'SEM CONTA'
  console.log(`  ${c.p.data} · ${brl(c.p.valor)} · print→${String(c.p.destinatario ?? '?').slice(0, 28)} | app→${nomeDoLancamento(l).slice(0, 26)} · ${l.forma_pagamento} · ${conta} · ${marca}`)
}

console.log(`\n=== PRINT SEM ESTORNO NO APP: ${sozinho.length} · ${brl(sozinho.reduce((s, p) => s + Number(p.valor), 0))} ===`)
for (const p of sozinho.sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
  console.log(`  ✖ ${p.data} · ${brl(p.valor)} · ${String(p.destinatario ?? '?').slice(0, 40)} · E2E ${String(p.transacao_id ?? '—').slice(0, 22)}`)
}

// Só o período dos prints (± DIAS): sem isso a lista "app sem print" traz setembro.
const datas = prints.map((p) => p.data).filter(Boolean).sort()
const de = datas[0], ate = datas[datas.length - 1]
const noPeriodo = (l) => {
  const d = dia(l.data_pagamento)
  return d && de && ate && dif(d, de) < 400 && d >= de.slice(0, 8) + '01' && d <= ate.slice(0, 8) + '31'
}
const appSemPrint = app.filter((l) => !usados.has(l.id) && noPeriodo(l))
console.log(`\n=== ESTORNO NO APP SEM PRINT: ${appSemPrint.length} · ${brl(appSemPrint.reduce((s, l) => s + Number(l.valor), 0))} ===`)
for (const l of appSemPrint.slice(0, 60)) console.log(`  ✖ ${dia(l.data_pagamento)} · ${brl(Number(l.valor))} · ${(l.pessoa_nome ?? l.descricao ?? '').slice(0, 40)}`)

console.log(`\n=== RESUMO ===`)
console.log(`  prints lidos (envio):     ${prints.length}`)
console.log(`  com estorno no app:       ${casados.length} (nome confirmado: ${casados.filter((c) => c.porNome).length})`)
console.log(`  print sem estorno:        ${sozinho.length} · ${brl(sozinho.reduce((s, p) => s + Number(p.valor), 0))}`)
console.log(`  estorno sem print:        ${appSemPrint.length} · ${brl(appSemPrint.reduce((s, l) => s + Number(l.valor), 0))}`)
