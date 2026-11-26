// CRUZAMENTO — extrato do PagBank × app. SÓ LÊ.
//
//   node --env-file=.env.local scripts/cruzar-extrato-pagbank.mjs "<caminho do csv>" [dias]
//
// O extrato é a verdade do banco: mostra TODO PIX que saiu e todo que entrou.
// O app é a verdade da loja: mostra qual devolução/estorno/fornecedor aquele
// dinheiro pagou. Este script põe um do lado do outro e nomeia as diferenças:
//
//   A) PIX que saiu do banco e NÃO tem conta no app  → dinheiro sem motivo
//   B) conta paga em PIX no app e NÃO existe no extrato → pagamento fantasma
//
// Casamento: valor exato (±1 centavo) e data a até N dias (padrão 3). O nome só
// desempata — o extrato do PagBank trunca nome e o comprovante não.
import fs from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const arquivo = process.argv[2]
if (!arquivo) { console.error('uso: scripts/cruzar-extrato-pagbank.mjs "<csv do extrato>" [dias]'); process.exit(1) }
const DIAS = Number(process.argv[3] ?? 3)
const h = { apikey: key, Authorization: `Bearer ${key}` }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// ---------- extrato ----------
const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter((l) => l.trim())
const cab = linhas.shift().split(';').map((c) => norm(c))
const iData = cab.indexOf('DATA'), iTipo = cab.indexOf('TIPO'), iDesc = cab.indexOf('DESCRICAO'), iValor = cab.indexOf('VALOR')
const mov = linhas.map((l) => {
  const c = l.split(';')
  const valor = Number(String(c[iValor] ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const [dia, mes, ano] = String(c[iData] ?? '').split('/')
  return { tipo: (c[iTipo] ?? '').trim(), desc: (c[iDesc] ?? '').trim(), valor, dia: `${ano}-${mes}-${dia}` }
})

const soma = (lista) => lista.reduce((s, m) => s + m.valor, 0)
const saidas = mov.filter((m) => m.valor < 0)
const entradas = mov.filter((m) => m.valor > 0)
const pixEnviado = saidas.filter((m) => /Pix enviado|QR Code Pix enviado|Pix agendado/i.test(m.tipo))
const pixRecebido = entradas.filter((m) => /Pix recebido/i.test(m.tipo))
const vendasPix = entradas.filter((m) => /Vendas/i.test(m.tipo) && /PIX/i.test(m.desc))

console.log(`\n=== EXTRATO (${arquivo.split(/[\\/]/).pop()}) ===`)
console.log(`  ${mov.length} movimentos · ${mov[0]?.dia} a ${mov[mov.length - 1]?.dia}`)
console.log(`  entradas: ${entradas.length} · ${brl(soma(entradas))}`)
console.log(`  saídas:   ${saidas.length} · ${brl(soma(saidas))}`)
console.log(`  PIX ENVIADO (saída):  ${pixEnviado.length} · ${brl(soma(pixEnviado))}`)
console.log(`  PIX RECEBIDO:         ${pixRecebido.length} · ${brl(soma(pixRecebido))}`)
console.log(`  Vendas PIX (recebido): ${vendasPix.length} · ${brl(soma(vendasPix))}`)
const porTipo = {}
for (const m of mov) porTipo[m.tipo] = (porTipo[m.tipo] ?? 0) + m.valor
console.log('\n  por tipo:')
for (const [t, v] of Object.entries(porTipo).sort((a, b) => a[1] - b[1])) console.log(`    ${brl(v).padStart(14)}  ${t}`)

// ---------- app: contas a pagar já pagas por PIX ----------
const desde = mov[0]?.dia, ate = mov[mov.length - 1]?.dia
const q = new URLSearchParams({
  select: 'id,valor,status,descricao,pessoa_nome,forma_pagamento,data_pagamento,conta_id,devolucao_id',
  tipo: 'eq.pagar', status: 'eq.pago',
  data_pagamento: `gte.${desde}`,
  order: 'data_pagamento', limit: '2000',
})
const appTodas = await (await fetch(`${url}/rest/v1/lancamentos?${q}&data_pagamento=lte.${ate}T23:59:59`, { headers: h })).json()
const ehFornecedor = (l) => /fornecedor/i.test(String(l.forma_pagamento ?? ''))
const ehForaDoApp = (l) => /fora/i.test(String(l.forma_pagamento ?? ''))
// "PIX do cliente ao fornecedor" NÃO sai do PagBank: o cliente paga o fornecedor
// direto. No extrato isso aparece como Pix RECEBIDO, nunca como Pix enviado.
const appPix = appTodas.filter((l) => /pix|fora/i.test(String(l.forma_pagamento ?? '')) && !ehFornecedor(l))
const diaDe = (iso) => String(iso ?? '').slice(0, 10)
const diffDias = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000)

console.log(`\n=== APP: contas pagas por PIX no período: ${appPix.length} · ${brl(appPix.reduce((s, l) => s + Number(l.valor), 0))} ===`)
const foraDoApp = appPix.filter((l) => /fora/i.test(String(l.forma_pagamento ?? '')))
const semConta = appPix.filter((l) => !l.conta_id)
console.log(`  marcadas "fora do app": ${foraDoApp.length} · ${brl(foraDoApp.reduce((s, l) => s + Number(l.valor), 0))}  (não baixam banco)`)
console.log(`  sem conta_id:           ${semConta.length} · ${brl(semConta.reduce((s, l) => s + Number(l.valor), 0))}`)

// ---------- A) PIX do extrato sem conta no app ----------
const usadas = new Set()
for (const m of pixEnviado) {
  const alvo = -m.valor
  const achou = appPix.find((l, i) => !usadas.has(l.id) && Math.abs(Number(l.valor) - alvo) < 0.011 && diffDias(diaDe(l.data_pagamento), m.dia) <= DIAS)
  if (achou) usadas.add(achou.id)
  else m.semApp = true
}
const orfaosExtrato = pixEnviado.filter((m) => m.semApp)
console.log(`\n=== A) PIX que saiu do BANCO e não achei conta no app: ${orfaosExtrato.length} · ${brl(soma(orfaosExtrato))} ===`)
for (const m of orfaosExtrato.sort((a, b) => a.dia.localeCompare(b.dia))) {
  console.log(`  ${m.dia} · ${brl(-m.valor)} · ${m.desc.slice(0, 45)} · ${m.tipo}`)
}

// ---------- B) conta paga por PIX no app sem PIX no extrato ----------
const semExtrato = appPix.filter((l) => !usadas.has(l.id))
console.log(`\n=== B) conta paga em PIX no app SEM PIX no extrato: ${semExtrato.length} · ${brl(semExtrato.reduce((s, l) => s + Number(l.valor), 0))} ===`)
const fornecedor = appTodas.filter(ehFornecedor)
console.log(`  (fora desta conta: ${fornecedor.length} linhas de "PIX do cliente ao fornecedor" · ${brl(fornecedor.reduce((s, l) => s + Number(l.valor), 0))} — esse dinheiro nunca passou pelo PagBank)`)
for (const l of semExtrato) {
  const forma = /fora/i.test(String(l.forma_pagamento)) ? ' · fora do app' : ''
  console.log(`  ${diaDe(l.data_pagamento)} · ${brl(Number(l.valor))} · ${(l.pessoa_nome ?? l.descricao ?? '').slice(0, 45)}${forma} · dev=${l.devolucao_id ? 'sim' : 'não'}`)
}

console.log(`\n=== RESUMO ===`)
console.log(`  PIX do banco sem motivo no app: ${orfaosExtrato.length} · ${brl(soma(orfaosExtrato))}`)
console.log(`  Conta no app sem PIX no banco:  ${semExtrato.length} · ${brl(semExtrato.reduce((s, l) => s + Number(l.valor), 0))}`)
