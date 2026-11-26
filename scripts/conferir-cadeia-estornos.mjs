// CADEIA DO ESTORNO — confere se o dinheiro provado no banco está certo em TODOS
// os lugares do sistema. SÓ LÊ.
//
//   node --env-file=.env.local scripts/conferir-cadeia-estornos.mjs "<csv do extrato>" [dias]
//
// Para cada PIX enviado que casa com devolução do app, segue a corrente inteira:
//
//   venda → devolução (valor, motivo) → itens (estoque: voltou? avaria? troca?)
//        → crédito do cliente (nasceu? foi estornado? saldo zero?)
//        → lançamento no Financeiro (valor, forma PIX, conta PagBank, data)
//        → caixa (não pode ter saída de gaveta num estorno PIX)
//
// A conta que fecha é a matemática: valor da devolução = reembolso = valor do
// lançamento, e o crédito do cliente tem que zerar (crédito − estorno).
import fs from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const arquivo = process.argv[2]
if (!arquivo) { console.error('uso: scripts/conferir-cadeia-estornos.mjs "<csv>" [dias]'); process.exit(1) }
const DIAS = Number(process.argv[3] ?? 3)
const PAGBANK = '24bff81f-9728-4e10-9b1b-9aad26a2952d'
const h = { apikey: key, Authorization: `Bearer ${key}` }
const get = async (caminho) => {
  const r = await fetch(`${url}/rest/v1/${caminho}`, { headers: h })
  if (!r.ok) throw new Error(`${caminho}: ${(await r.text()).slice(0, 150)}`)
  return r.json()
}
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const diaDe = (iso) => String(iso ?? '').slice(0, 10)
const lag = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000)

// ---------- extrato ----------
const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter((l) => l.trim())
const cab = linhas.shift().split(';').map((c) => norm(c))
const i = (n) => cab.indexOf(n)
const pix = linhas.map((l) => {
  const c = l.split(';')
  const valor = Number(String(c[i('VALOR')] ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const [d, m, a] = String(c[i('DATA')] ?? '').split('/')
  return { tipo: (c[i('TIPO')] ?? '').trim(), desc: (c[i('DESCRICAO')] ?? '').trim(), valor: -valor, dia: `${a}-${m}-${d}` }
}).filter((m) => m.valor > 0 && /Pix enviado|QR Code Pix enviado/i.test(m.tipo))

const app = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,pessoa_id,forma_pagamento,conta_id,data_pagamento,devolucao_id,loja_id&tipo=eq.pagar&status=eq.pago&or=(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)&limit=2000`)

// ---------- casamento ----------
const usados = new Set()
const pares = []
for (const m of pix) {
  const l = app.find((x) => !usados.has(x.id) && Math.abs(Number(x.valor) - m.valor) < 0.011 && Math.abs(lag(diaDe(x.data_pagamento), m.dia)) <= DIAS)
  if (l) { usados.add(l.id); pares.push({ pixes: [m], app: l }) }
}
for (const l of app.filter((x) => !usados.has(x.id))) {
  const livres = pix.filter((m) => !pares.some((p) => p.pixes.includes(m)))
  for (let a = 0; a < livres.length; a++) for (let b = a + 1; b < livres.length; b++) {
    if (Math.abs(livres[a].valor + livres[b].valor - Number(l.valor)) < 0.011 && Math.abs(lag(diaDe(l.data_pagamento), livres[a].dia)) <= DIAS) {
      usados.add(l.id); pares.push({ pixes: [livres[a], livres[b]], app: l }); a = livres.length; break
    }
  }
}

// ---------- cadeia ----------
const problemas = []
const resumo = { ok: 0, semConta: 0, foraDoApp: 0, semCredito: 0, creditoNaoZerado: 0, semDevolucao: 0, semItem: 0, teveGaveta: 0, valorNaoBate: 0, dataDivergente: 0 }

for (const p of pares) {
  const L = p.app
  const problemasDeste = []

  // crédito e estorno do cliente
  const creditos = await get(`creditos_clientes?select=id,valor,tipo,descricao,devolucao_id,estorna_credito_id,created_at,loja_id&or=(pessoa_nome.ilike.*${encodeURIComponent(norm(L.pessoa_nome ?? '').slice(0, 20) || 'X')}*,pessoa_id.eq.${L.pessoa_id ?? '00000000-0000-0000-0000-000000000000'})&order=created_at.desc&limit=20`)
  const credito = creditos.find((c) => c.tipo === 'credito' && Math.abs(Number(c.valor) - Number(L.valor)) < 0.011)
  const estorno = credito ? creditos.find((c) => c.tipo === 'estorno' && c.estorna_credito_id === credito.id) : null

  // devolução
  const devolucaoId = L.devolucao_id ?? credito?.devolucao_id ?? null
  let D = null, itens = []
  if (devolucaoId) {
    const d = await get(`devolucoes?select=id,venda_id,valor_total,tipo_credito,status,abate_fiado,reembolsos,motivo,motivo_tipo,created_at&id=eq.${devolucaoId}`)
    D = d[0] ?? null
    if (D) itens = await get(`itens_devolucao?select=nome,quantidade,preco_unitario,total_item,status_produto&devolucao_id=eq.${D.id}`)
  }

  // venda
  const venda = D?.venda_id ? (await get(`vendas?select=id,numero,total,status,created_at&id=eq.${D.venda_id}`))[0] ?? null : null

  // caixa (estorno PIX não pode sair da gaveta)
  const gaveta = await get(`movimentos_caixa?select=id,valor,tipo,motivo,created_at&tipo=eq.devolucao&valor=gte.${(Number(L.valor) - 0.011).toFixed(2)}&valor=lte.${(Number(L.valor) + 0.011).toFixed(2)}&limit=5`)

  // checagens
  if (!L.conta_id) { problemasDeste.push('sem conta (não baixa banco)'); resumo.semConta++ }
  else if (L.conta_id !== PAGBANK) { problemasDeste.push('conta diferente do PagBank'); resumo.semConta++ }
  if (/fora/i.test(String(L.forma_pagamento ?? ''))) { problemasDeste.push('forma "fora do app"'); resumo.foraDoApp++ }
  if (!credito) { problemasDeste.push('sem crédito do cliente'); resumo.semCredito++ }
  else if (!estorno) { problemasDeste.push('crédito não estornado (saldo fica com o cliente)'); resumo.creditoNaoZerado++ }
  if (!D) { problemasDeste.push('sem linha em devolucoes'); resumo.semDevolucao++ }
  if (D && itens.length === 0) { problemasDeste.push('devolução sem itens'); resumo.semItem++ }
  if (D) {
    const reemb = (D.reembolsos ?? []).reduce((s, r) => s + Number(r.valor ?? 0), 0)
    const soma = reemb + Number(D.abate_fiado ?? 0)
    if (Math.abs(soma - Number(D.valor_total)) > 0.011) { problemasDeste.push(`devolução ${brl(D.valor_total)} ≠ reembolso ${brl(reemb)} + abatido ${brl(D.abate_fiado)}`); resumo.valorNaoBate++ }
  }
  if (gaveta.length && !gaveta.every((g) => /pix/i.test(String(g.motivo ?? '')))) { problemasDeste.push(`${gaveta.length} saída(s) de gaveta com esse valor`); resumo.teveGaveta++ }
  const d = lag(diaDe(L.data_pagamento), p.pixes[0].dia)
  if (d !== 0) resumo.dataDivergente++

  if (problemasDeste.length === 0) resumo.ok++
  else problemas.push({ L, p, D, venda, itens, credito, estorno, problemasDeste, d })

  void estorno
}

// ---------- relatório ----------
console.log(`\n=== CADEIA CONFERIDA: ${pares.length} estornos provados no banco ===`)
console.log(`  corrente inteira OK: ${resumo.ok}`)
console.log(`  com algum elo faltando: ${pares.length - resumo.ok}`)
console.log(`  detalhe: sem conta ${resumo.semConta} · fora do app ${resumo.foraDoApp} · sem crédito ${resumo.semCredito} · crédito não estornado ${resumo.creditoNaoZerado} · sem devolução ${resumo.semDevolucao} · sem item ${resumo.semItem} · gaveta ${resumo.teveGaveta} · soma não bate ${resumo.valorNaoBate} · data divergente ${resumo.dataDivergente}`)

if (problemas.length) {
  console.log(`\n=== OS QUE NÃO ESTÃO 100% ===`)
  for (const x of problemas) {
    console.log(`\n  ${x.p.pixes.map((m) => m.dia + ' ' + brl(m.valor)).join(' + ')} · ${x.L.pessoa_nome ?? x.L.descricao}`)
    if (x.venda) console.log(`    venda #${x.venda.numero} · ${brl(x.venda.total)} · ${x.venda.status}`)
    if (x.D) console.log(`    devolução ${brl(x.D.valor_total)} · ${x.D.tipo_credito} · ${x.D.status} · motivo: ${x.D.motivo ?? '—'}`)
    if (x.itens.length) console.log(`    estoque: ` + x.itens.map((it) => `${it.quantidade}x ${it.nome} (${it.status_produto})`).join(' · '))
    if (x.credito) console.log(`    crédito ${brl(x.credito.valor)} · estorno ${x.estorno ? 'sim' : 'NÃO'}`)
    console.log(`    lançamento: ${brl(x.L.valor)} · ${x.L.forma_pagamento} · conta ${x.L.conta_id ? 'ok' : 'NENHUMA'} · app dia ${diaDe(x.L.data_pagamento)} (banco ${x.p.pixes[0].dia})`)
    console.log(`    ⚠️ ${x.problemasDeste.join(' · ')}`)
  }
}

console.log(`\n=== OS QUE ESTÃO CERTOS NOS TRÊS LADOS ===`)
const certos = pares.filter((p) => !problemas.some((x) => x.L.id === p.app.id))
for (const p of certos.sort((a, b) => a.pixes[0].dia.localeCompare(b.pixes[0].dia))) {
  console.log(`  ✔ ${p.pixes[0].dia} · ${brl(Number(p.app.valor))} · ${p.app.pessoa_nome ?? p.app.descricao}`)
}
console.log(`\n  total certo: ${certos.length} · ${brl(certos.reduce((s, p) => s + Number(p.app.valor), 0))}`)
