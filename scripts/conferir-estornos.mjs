// CONFERENTE DE ESTORNOS — diz, para CADA PIX enviado do extrato, se casou com o
// estorno do app e por quê. É o código respondendo "casou ou não casou".
//
//   node --env-file=.env.local scripts/conferir-estornos.mjs "<csv do extrato>" [dias]
//
// Regra de casamento (a mesma do robô):
//   1. conta a pagar PAGA com o MESMO valor (±1 centavo) e data a até N dias;
//   2. a linha precisa ser devolução/estorno (descrição ou devolucao_id);
//   3. casou "cheio" quando também tem `devolucao_id` ligado e o reembolso da
//      devolução diz `pix` (ou seja: o app concorda que o dinheiro voltou).
//
// Saída: cada PIX com CASOU / CASOU (incompleto) / NÃO CASOU + motivo, e o resumo.
import fs from 'node:fs'
import { normNome, mesmoNome } from './lib-nome-extrato.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const arquivo = process.argv[2]
if (!arquivo) { console.error('uso: scripts/conferir-estornos.mjs "<csv do extrato>" [dias]'); process.exit(1) }
const DIAS = Number(process.argv[3] ?? 3)
const h = { apikey: key, Authorization: `Bearer ${key}` }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const dia = (x) => String(x ?? '').slice(0, 10)
const dif = (a, b) => (a && b ? Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000) : 999)

// ---------- extrato: PIX enviados ----------
const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter((l) => l.trim())
const cab = linhas.shift().split(';').map((c) => normNome(c))
const iD = cab.indexOf('DATA'), iT = cab.indexOf('TIPO'), iDe = cab.indexOf('DESCRICAO'), iV = cab.indexOf('VALOR')
const pixes = linhas.map((l) => {
  const c = l.split(';')
  const valor = Number(String(c[iV] ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const [d, m, a] = String(c[iD] ?? '').split('/')
  return { tipo: (c[iT] ?? '').trim(), nome: (c[iDe] ?? '').trim(), valor: -valor, dia: `${a}-${m}-${d}` }
}).filter((m) => m.valor > 0 && /Pix enviado|QR Code Pix enviado/i.test(m.tipo))

// ---------- app: contas de devolução pagas ----------
const contas = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,pessoa_id,forma_pagamento,conta_id,data_pagamento,devolucao_id,status&tipo=eq.pagar&status=eq.pago&or=(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)&limit=2000`)

// ---------- devoluções: quem diz que o dinheiro voltou ----------
// Busca por id sob demanda: a tabela passa de 3.000 linhas e uma leitura única
// deixava devolução de fora — daí todo mundo aparecer "sem devolução ligada".
const cacheDev = new Map()
async function devDe(id) {
  if (!id) return null
  if (cacheDev.has(id)) return cacheDev.get(id)
  const d = (await get(`devolucoes?select=id,valor_total,tipo_credito,reembolsos&id=eq.${id}`))[0] ?? null
  cacheDev.set(id, d)
  return d
}

const nomeConta = (c) => String(c.pessoa_nome ?? '').replace(/^(Devolu[çc][ãa]o|Estorno de cr[ée]dito)[^—–-]*[—–-]\s*/i, '').trim()

const resultados = []
const usados = new Set()
for (const p of pixes) {
  const cand = contas.filter((c) => !usados.has(c.id) && Math.abs(Number(c.valor) - p.valor) < 0.011 && dif(dia(c.data_pagamento), p.dia) <= DIAS)
  // O critério é "EXISTE conta que fecha a corrente?", não "é a única conta". Antes eu
  // exigia candidato único e, quando havia várias de mesmo valor, devolvia "não casou"
  // mesmo com a conta certa ligada. Agora avalia cada candidata e escolhe a melhor:
  // nome que casa > tem devolução > data mais próxima.
  const avaliar = async (c) => {
    // (dev é resolvida antes de avaliar, por causa do await)
    const reembPix = (dev?.reembolsos ?? []).some((r) => r.tipo === 'pix')
    const formaOk = /pix/i.test(String(c.forma_pagamento ?? '')) && !!c.conta_id
    const nomeOk = mesmoNome(p.nome, nomeConta(c))
    const faltas = []
    if (!dev) faltas.push('conta sem devolução ligada')
    else if (!reembPix) faltas.push(`devolução está "${dev.tipo_credito}" (reembolso não é pix)`)
    if (!formaOk) faltas.push('forma/conta do lançamento não é PIX no banco')
    if (!c.pessoa_id) faltas.push('lançamento sem cadastro (pessoa_id)')
    const pontos = (nomeOk ? 100 : 0) + (dev ? 50 : 0) + (reembPix ? 25 : 0) + (formaOk ? 10 : 0) + (c.pessoa_id ? 5 : 0) - dif(dia(c.data_pagamento), p.dia)
    return { c, dev, faltas, pontos, nomeOk }
  }
  const avaliadas = []
  for (const c of cand) {
    const dev = await devDe(c.devolucao_id)
    const reembPix = (dev?.reembolsos ?? []).some((r) => r.tipo === 'pix')
    const formaOk = /pix/i.test(String(c.forma_pagamento ?? '')) && !!c.conta_id
    const nomeOk = mesmoNome(p.nome, nomeConta(c))
    const faltas = []
    if (!dev) faltas.push('conta sem devolução ligada')
    else if (!reembPix) faltas.push(`devolução está "${dev.tipo_credito}" (reembolso não é pix)`)
    if (!formaOk) faltas.push('forma/conta do lançamento não é PIX no banco')
    if (!c.pessoa_id) faltas.push('lançamento sem cadastro (pessoa_id)')
    const pontos = (nomeOk ? 100 : 0) + (dev ? 50 : 0) + (reembPix ? 25 : 0) + (formaOk ? 10 : 0) + (c.pessoa_id ? 5 : 0) - dif(dia(c.data_pagamento), p.dia)
    avaliadas.push({ c, dev, faltas, pontos, nomeOk })
  }
  avaliadas.sort((a, b) => b.pontos - a.pontos)
  const melhor = avaliadas[0] ?? null
  const completa = avaliadas.find((a) => a.faltas.length === 0)
  const alvo = completa?.c ?? melhor?.c ?? null
  const faltasAlvo = (completa ?? melhor)?.faltas ?? []
  const devAlvo = (completa ?? melhor)?.dev ?? null
  if (alvo) usados.add(alvo.id)

  if (!alvo) {
    resultados.push({ p, status: 'NÃO CASOU', motivo: cand.length > 1 ? `${cand.length} contas com esse valor` : 'nenhuma conta de devolução com esse valor e data' })
    continue
  }
  resultados.push(faltasAlvo.length === 0
    ? { p, status: 'CASOU', alvo, dev: devAlvo }
    : { p, status: 'CASOU (incompleto)', alvo, dev: devAlvo, motivo: faltasAlvo.join(' · ') })
}

// ---------- relatório ----------
const cheios = resultados.filter((r) => r.status === 'CASOU')
const incompletos = resultados.filter((r) => r.status === 'CASOU (incompleto)')
const nao = resultados.filter((r) => r.status === 'NÃO CASOU')

console.log(`\n=== CONFERENTE DE ESTORNOS — ${pixes.length} PIX enviados no extrato ===\n`)
console.log(`✔ CASOU (dinheiro + devolução + conta certos): ${cheios.length} · ${brl(cheios.reduce((s, r) => s + r.p.valor, 0))}`)
console.log(`~ CASOU (incompleto):                          ${incompletos.length} · ${brl(incompletos.reduce((s, r) => s + r.p.valor, 0))}`)
console.log(`✖ NÃO CASOU:                                  ${nao.length} · ${brl(nao.reduce((s, r) => s + r.p.valor, 0))}`)

if (incompletos.length) {
  console.log(`\n--- CASOU MAS FALTA ALGO ---`)
  for (const r of incompletos) console.log(`  ${r.p.dia} · ${brl(r.p.valor).padEnd(11)} · ${r.p.nome.slice(0, 32).padEnd(32)} → ${nomeConta(r.alvo).slice(0, 26)} · ${r.motivo}`)
}
if (nao.length) {
  console.log(`\n--- NÃO CASOU (PIX saiu e o app não tem a devolução) ---`)
  for (const r of nao) console.log(`  ${r.p.dia} · ${brl(r.p.valor).padEnd(11)} · ${r.p.nome.slice(0, 40).padEnd(40)} · ${r.motivo}`)
}
console.log(`\n--- CASADOS ---`)
for (const r of cheios) console.log(`  ✔ ${r.p.dia} · ${brl(r.p.valor).padEnd(11)} · ${r.p.nome.slice(0, 34).padEnd(34)} → ${nomeConta(r.alvo).slice(0, 28)} (${r.dev.tipo_credito})`)
