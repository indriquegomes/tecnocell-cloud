// AMARRA CADA PROVA (print do PIX) À COMPRA QUE ELA PAGOU. SÓ LÊ + grava metadado.
//
//   node --env-file=.env.local scripts/amarrar-venda.mjs            (ensaio)
//   node --env-file=.env.local scripts/amarrar-venda.mjs --aplicar  (grava o vínculo)
//
// O que ele faz: para cada print já ligado a uma conta a pagar, procura a VENDA
// daquele cliente com aquele valor perto daquela data. Achando uma só, grava
// `venda_id`/`venda_numero` dentro de `pix_saidas.extraido_raw` — o comprovante
// passa a apontar para a compra.
//
// O que ele NÃO faz (de propósito): não cria devolução, não mexe em estoque, não
// altera valor/status/forma da conta. Criar devolução retroativa muda resultado do
// mês e estoque — isso é decisão do dono, caso a caso.
import { mesmoNome, normNome } from './lib-nome-extrato.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => (await fetch(`${url}/rest/v1/${p}`, { headers: h })).json()
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const dia = (x) => String(x ?? '').slice(0, 10)
const dif = (a, b) => (a && b ? Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000) : 999)

const provas = await get(`pix_saidas?select=id,valor,dia,destinatario,transacao_id,lancamento_id,extraido_raw&lancamento_id=not.is.null&order=dia&limit=100`)
const ids = [...new Set(provas.map((p) => p.lancamento_id))]
const contas = await get(`lancamentos?select=id,valor,pessoa_nome,pessoa_id,devolucao_id,descricao,data_pagamento&id=in.(${ids.join(',')})`)

const semDevolucao = provas.filter((p) => {
  const c = contas.find((x) => x.id === p.lancamento_id)
  return c && !c.devolucao_id
})
console.log(`\nprovas sem devolução amarrada: ${semDevolucao.length}`)

const achados = []
const duvidosos = []
for (const p of semDevolucao) {
  const c = contas.find((x) => x.id === p.lancamento_id)
  const nome = String(c.pessoa_nome ?? c.descricao ?? '')
  // vendas possíveis: mesmo valor e data próxima (a venda é antes ou no dia do PIX)
  const vendas = await get(`vendas?select=id,numero,total,status,created_at,pessoa_id&total=gte.${(Number(p.valor) - 0.011).toFixed(2)}&total=lte.${(Number(p.valor) + 0.011).toFixed(2)}&created_at=gte.${p.dia}T00:00:00&created_at=lte.${p.dia}T23:59:59&limit=50`)
  const porData = await get(`vendas?select=id,numero,total,status,created_at,pessoa_id&total=gte.${(Number(p.valor) - 0.011).toFixed(2)}&total=lte.${(Number(p.valor) + 0.011).toFixed(2)}&order=created_at.desc&limit=200`)
  const candidatas = (porData ?? []).filter((v) => dif(dia(v.created_at), p.dia) <= 10)
  const pessoas = new Map()
  for (const v of candidatas) {
    if (!v.pessoa_id || pessoas.has(v.pessoa_id)) continue
    const pe = await get(`pessoas?select=id,nome&id=eq.${v.pessoa_id}`)
    pessoas.set(v.pessoa_id, pe[0]?.nome ?? null)
  }
  const comNome = candidatas.filter((v) => mesmoNome(nome, pessoas.get(v.pessoa_id)))
  const alvo = comNome.length === 1 ? comNome[0] : (comNome.length === 0 && candidatas.length === 1 ? candidatas[0] : null)
  if (alvo) achados.push({ p, c, venda: alvo, nomeVenda: pessoas.get(alvo.pessoa_id) ?? null, modo: comNome.length ? 'nome+valor+data' : 'valor+data (única)' })
  else duvidosos.push({ p, c, candidatas: candidatas.length, comNome: comNome.length, vendasDia: vendas.length, nome })
  void nomes
}
function nomes() {}

console.log(`\n=== VENDA ENCONTRADA: ${achados.length} ===`)
for (const x of achados.sort((a, b) => a.p.dia.localeCompare(b.p.dia))) {
  console.log(`  ${x.p.dia} · ${brl(x.p.valor).padEnd(11)} · ${String(x.c.pessoa_nome ?? x.c.descricao).slice(0, 30).padEnd(30)} → venda #${x.venda.numero} (${brl(x.venda.total)}, ${dia(x.venda.created_at)}, ${x.venda.status}) · ${x.modo}`)
}
console.log(`\n=== SEM CERTEZA: ${duvidosos.length} ===`)
for (const x of duvidosos) {
  console.log(`  ${x.p.dia} · ${brl(x.p.valor).padEnd(11)} · ${String(x.c.pessoa_nome ?? x.c.descricao).slice(0, 30).padEnd(30)} — ${x.candidatas} venda(s) com esse valor em ±10 dias, ${x.comNome} no nome do cliente`)
}

if (!aplicar) {
  console.log(`\n(ensaio: nada gravado. --aplicar grava só o vínculo do comprovante com a venda, nos ${achados.length} acima.)`)
  process.exit(0)
}

let ok = 0
for (const x of achados) {
  const extra = { ...(x.p.extraido_raw ?? {}), venda_id: x.venda.id, venda_numero: x.venda.numero, venda_total: Number(x.venda.total), venda_data: dia(x.venda.created_at), venda_modo: x.modo }
  const r = await fetch(`${url}/rest/v1/pix_saidas?id=eq.${x.p.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ extraido_raw: extra }) })
  if (r.ok) ok++
}
console.log(`\nvínculos de venda gravados: ${ok} de ${achados.length}`)
