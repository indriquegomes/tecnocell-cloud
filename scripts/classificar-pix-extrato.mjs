// Classifica os PIX enviados do extrato: é estorno de cliente ou é outra coisa?
// SÓ LÊ. Existe porque o relatório cru joga folha, fornecedor e imposto na mesma
// lista do estorno — e aí o número assusta sem ser verdade.
//
//   node --env-file=.env.local scripts/classificar-pix-extrato.mjs "<csv>"
import fs from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const arquivo = process.argv[2]
const h = { apikey: key, Authorization: `Bearer ${key}` }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const get = async (caminho) => (await fetch(`${url}/rest/v1/${caminho}`, { headers: h })).json()

// nomes que claramente NÃO são cliente (instituição/loja/serviço)
const NAO_CLIENTE = /Ltda|S\.? ?A$|Matriz|Federal|Posto|Marketplace|Atacadista|Armazem|Monteverde|Enel|Aguia|M4 Produtos|Client Co|PagSeguro|PagBank|Distribuicao|Transportes|Servicos/i

const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter((l) => l.trim())
const cab = linhas.shift().split(';').map((c) => norm(c))
const iData = cab.indexOf('DATA'), iTipo = cab.indexOf('TIPO'), iDesc = cab.indexOf('DESCRICAO'), iValor = cab.indexOf('VALOR')
const pix = linhas.map((l) => {
  const c = l.split(';')
  const valor = Number(String(c[iValor] ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const [d, m, a] = String(c[iData] ?? '').split('/')
  return { tipo: (c[iTipo] ?? '').trim(), desc: (c[iDesc] ?? '').trim(), valor: -valor, dia: `${a}-${m}-${d}` }
}).filter((m) => m.valor > 0)

// o que já está provado como estorno (A do cruzar-estornos)
const app = await get(`lancamentos?select=id,valor,pessoa_nome,descricao,data_pagamento,forma_pagamento,devolucao_id&tipo=eq.pagar&status=eq.pago&or=(descricao.ilike.*devolu*,descricao.ilike.*estorno*,devolucao_id.not.is.null)&limit=2000`)
const diaDe = (iso) => String(iso ?? '').slice(0, 10)
const diff = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000)
const usados = new Set()
for (const m of pix) {
  const l = app.find((x) => !usados.has(x.id) && Math.abs(Number(x.valor) - m.valor) < 0.011 && diff(diaDe(x.data_pagamento), m.dia) <= 3)
  if (l) { usados.add(l.id); m.casado = l }
}

const categorias = new Map()
for (const m of pix.filter((x) => !x.casado)) {
  const nome = m.desc.replace(/^\d[\d. ]*/, '').trim()
  if (m.casado === undefined && NAO_CLIENTE.test(nome)) { m.cat = 'fora do escopo (instituição/loja/serviço)'; continue }
  const achados = await get(`lancamentos?select=tipo,status,descricao,valor,forma_pagamento,data_pagamento&or=(pessoa_nome.ilike.*${encodeURIComponent(nome)}*,descricao.ilike.*${encodeURIComponent(nome)}*)&limit=5`)
  const cliente = await get(`pessoas?select=nome,tipo&nome=ilike.*${encodeURIComponent(nome)}*&limit=3`)
  if (achados.length === 0) { m.cat = 'SEM NADA NO APP'; m.detalhe = cliente.length ? `cadastro: ${cliente[0].tipo}` : 'nem cadastro de pessoa' ; continue }
  const salario = achados.find((a) => /salario|meta |comissao|bonus|vale transporte|adiantamento/i.test(norm(a.descricao)))
  if (salario) { m.cat = 'folha (salário/meta/comissão)'; continue }
  const fornecedor = achados.find((a) => /mercadoria|fornecedor|nota fiscal|compra/i.test(norm(a.descricao)))
  if (fornecedor) { m.cat = 'fornecedor/mercadoria'; continue }
  m.cat = 'existe no app, mas não como devolução: ' + norm(achados[0].descricao).slice(0, 40)
}

for (const m of pix) {
  const k = m.casado ? 'ESTORNO PROVADO' : m.cat
  categorias.set(k, [...(categorias.get(k) ?? []), m])
}

console.log(`\n=== PIX ENVIADO POR CATEGORIA (${pix.length} · ${brl(pix.reduce((s, m) => s + m.valor, 0))}) ===`)
for (const [k, lista] of [...categorias.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n-- ${k}: ${lista.length} · ${brl(lista.reduce((s, m) => s + m.valor, 0))}`)
  if (!/PROVADO|folha|fora do escopo/.test(k)) for (const m of lista) console.log(`   ${m.dia} · ${brl(m.valor)} · ${m.desc.slice(0, 48)}${m.detalhe ? ' · ' + m.detalhe : ''}`)
}

const semNada = pix.filter((m) => m.cat === 'SEM NADA NO APP')
console.log(`\n=== RESUMO ===`)
console.log(`  estorno provado no banco:        ${pix.filter((m) => m.casado).length} · ${brl(pix.filter((m) => m.casado).reduce((s, m) => s + m.valor, 0))}`)
console.log(`  PIX sem NADA no app:             ${semNada.length} · ${brl(semNada.reduce((s, m) => s + m.valor, 0))}`)
