#!/usr/bin/env node
// DIAGNOSTICO DO DINHEIRO — SO LE. Nao escreve nada no banco.
//
// Mede, no dado real, o tamanho de cada divergencia conhecida do dinheiro:
// formato de data do pagamento, valor_pago ausente, historico de pagamento
// faltando, divida sem cadastro (pessoa_id) e nome de cliente repetido.
//
// Uso:
//   node scripts/dinheiro-diagnostico.mjs
//   node scripts/dinheiro-diagnostico.mjs --json    (saida crua, para guardar)
//
// A chave vem de .env.local (SUPABASE_SERVICE_ROLE_KEY) — o mesmo arquivo que o
// app usa. Nao grava nada em documento nem em log versionado.

import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const URL_BASE = String(env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) { console.error('Faltou NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local'); process.exit(1) }
const HEAD = { apikey: KEY, Authorization: 'Bearer ' + KEY }

const DINHEIRO = (txt) => String(txt ?? '').trim().toLowerCase().includes('dinheiro')

async function buscar(caminho, colunas, filtros = '') {
  const out = []
  for (let pag = 0; ; pag++) {
    const url = `${URL_BASE}/rest/v1/${caminho}?select=${colunas}${filtros}&order=id&limit=1000&offset=${pag * 1000}`
    const r = await fetch(url, { headers: HEAD })
    if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) break
    if (pag > 200) break // trava: 200 mil linhas e sinal de filtro errado
  }
  return out
}

const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const semAcento = (s) => String(s ?? '').normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toUpperCase().trim()

// Data no fuso de Sao Paulo (en-CA = YYYY-MM-DD)
const diaSP = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const diaUTC = (iso) => String(iso).slice(0, 10)

const linhas = []
const linha = (t = '') => { linhas.push(t); console.log(t) }
const secao = (t) => { linha(); linha('='.repeat(72)); linha(t); linha('='.repeat(72)) }

async function main() {
  secao('1. LANCAMENTOS — retrato geral')
  const lanc = await buscar('lancamentos', 'id,tipo,status,valor,valor_pago,data_pagamento,forma_pagamento,historico_pagamentos,pessoa_id,pessoa_nome,venda_id,loja_id,categoria')
  const pago = lanc.filter((l) => l.status === 'pago')
  const pend = lanc.filter((l) => l.status === 'pendente')
  linha(`lancamentos lidos: ${lanc.length}  ·  pagos: ${pago.length}  ·  pendentes: ${pend.length}  ·  outros status: ${lanc.length - pago.length - pend.length}`)
  linha(`pendentes a receber: ${pend.filter((l) => l.tipo === 'receber').length}  ·  a pagar: ${pend.filter((l) => l.tipo === 'pagar').length}`)

  secao('2. FORMATO DA DATA DO PAGAMENTO (achado C3)')
  const semData = pago.filter((l) => !l.data_pagamento)
  const grupos = new Map()
  for (const l of pago) {
    if (!l.data_pagamento) continue
    const t = String(l.data_pagamento).slice(11, 19)
    if (!grupos.has(t)) grupos.set(t, { n: 0, valor: 0 })
    const g = grupos.get(t); g.n++; g.valor += Number(l.valor ?? 0)
  }
  linha('horário gravado (UTC) — quantos pagamentos e quanto:')
  for (const [t, g] of [...grupos.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const marca = t === '00:00:00' ? '  <-- 21h do DIA ANTERIOR em Brasília' : t === '15:00:00' ? '  <-- meio-dia em Brasília (seguro)' : ''
    linha(`  ${t}  ${String(g.n).padStart(6)} pagamentos   ${brl(g.valor).padStart(16)}${marca}`)
  }
  if (semData.length) linha(`  (sem data nenhuma: ${semData.length} — ${brl(semData.reduce((s, l) => s + Number(l.valor ?? 0), 0))})`)

  const diaDiferente = pago.filter((l) => l.data_pagamento && diaSP(l.data_pagamento) !== diaUTC(l.data_pagamento))
  linha(`pagamentos que mudam de DIA dependendo de quem lê: ${diaDiferente.length}  (${brl(diaDiferente.reduce((s, l) => s + Number(l.valor ?? 0), 0))})`)

  const porMesUTC = new Map(), porMesSP = new Map()
  for (const l of diaDiferente) {
    const u = diaUTC(l.data_pagamento).slice(0, 7), s = diaSP(l.data_pagamento).slice(0, 7)
    if (u === s) continue
    porMesUTC.set(u, (porMesUTC.get(u) ?? 0) + 1)
    porMesSP.set(s, (porMesSP.get(s) ?? 0) + 1)
  }
  if (porMesUTC.size) {
    linha('pagamentos que caem em MÊS DIFERENTE conforme a leitura:')
    for (const [u, n] of [...porMesUTC.entries()].sort()) linha(`  lido em UTC = ${u}: ${n} pagamento(s)  ·  lido em Brasília = ${[...porMesSP.keys()][0] ?? '?'}`)
  } else {
    linha('nenhum pagamento troca de mês pela data (o dia muda, o mês não) — a virada de mês ainda pode morder no dia 1º')
  }

  secao('3. VALOR_PAGO AUSENTE EM LANÇAMENTO PAGO')
  const semValorPago = pago.filter((l) => l.valor_pago == null || (Number(l.valor_pago) === 0 && Number(l.valor ?? 0) > 0))
  linha(`pagos com valor_pago vazio/zero e valor > 0: ${semValorPago.length}  (${brl(semValorPago.reduce((s, l) => s + Number(l.valor ?? 0), 0))})`)
  if (semValorPago.length) {
    const porCat = new Map()
    for (const l of semValorPago) porCat.set(l.categoria ?? '(sem categoria)', (porCat.get(l.categoria ?? '(sem categoria)') ?? 0) + 1)
    for (const [c, n] of [...porCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) linha(`   ${String(n).padStart(5)}  ${c}`)
    linha('   (quem soma "valor - valor_pago" conta esses como dívida ainda em aberto)')
  }

  secao('4. HISTÓRICO DE PAGAMENTO (achado C1)')
  const semHist = pago.filter((l) => !Array.isArray(l.historico_pagamentos) || l.historico_pagamentos.length === 0)
  linha(`pagos SEM histórico de pagamento: ${semHist.length}  (${brl(semHist.reduce((s, l) => s + Number(l.valor_pago ?? l.valor ?? 0), 0))})`)
  const somaHist = pago.filter((l) => Array.isArray(l.historico_pagamentos) && l.historico_pagamentos.length)
  let divergentes = 0, somaDiv = 0
  for (const l of somaHist) {
    const total = l.historico_pagamentos.reduce((s, h) => s + Number((h && h.valor) || 0), 0)
    if (Math.abs(total - Number(l.valor_pago ?? 0)) > 0.01) {
      divergentes++
      somaDiv += Math.abs(total - Number(l.valor_pago ?? 0))
    }
  }
  linha(`pagos COM histórico cuja soma não bate com valor_pago: ${divergentes} de ${somaHist.length}  (diferença acumulada ${brl(somaDiv)})`)
  linha('(o PDV mostra esse histórico no crediário: histórico faltando = cliente não vê o que já pagou)')

  secao('5. DÍVIDA SEM CADASTRO (achado C2)')
  const pendReceber = pend.filter((l) => l.tipo === 'receber')
  const semPessoa = pendReceber.filter((l) => !l.pessoa_id)
  const semPessoaSemVenda = semPessoa.filter((l) => !l.venda_id)
  linha(`a receber pendente: ${pendReceber.length}`)
  linha(`  sem pessoa_id: ${semPessoa.length}  (${brl(semPessoa.reduce((s, l) => s + (Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0))})`)
  linha(`    dos quais sem venda (não dá para descobrir o cliente): ${semPessoaSemVenda.length}  (${brl(semPessoaSemVenda.reduce((s, l) => s + (Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0))})`)

  secao('6. MESMO NOME, CADASTROS DIFERENTES (achado C2)')
  const porNome = new Map()
  for (const l of pendReceber) {
    if (!l.pessoa_id) continue
    const k = semAcento(l.pessoa_nome)
    if (!k) continue
    if (!porNome.has(k)) porNome.set(k, new Set())
    porNome.get(k).add(l.pessoa_id)
  }
  const cruzados = [...porNome.entries()].filter(([, ids]) => ids.size > 1)
  linha(`nomes com mais de um cadastro devendo: ${cruzados.length}`)
  let notasCruzadas = 0, valorCruzado = 0
  let i = 0
  for (const [nome, ids] of cruzados) {
    i++
    const doNome = pendReceber.filter((l) => semAcento(l.pessoa_nome) === nome && l.pessoa_id && ids.has(l.pessoa_id))
    const v = doNome.reduce((s, l) => s + (Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0)
    notasCruzadas += doNome.length
    valorCruzado += v
    // Sem nome de cliente na tela/saída: o dono identifica pelo cadastro na tela Fiados.
    if (cruzados.length <= 10) linha(`   cliente ${i}: ${ids.size} cadastros · ${doNome.length} nota(s) · ${brl(v)}`)
  }
  linha(`notas envolvidas: ${notasCruzadas}  ·  valor: ${brl(valorCruzado)}`)
  linha('(quem soma por nome — o PDV faz isso no limite de crédito — junta esses cadastros)')

  secao('7. LIMITE DE 1.000 LINHAS (achado A1)')
  linha(`fiados a receber pendentes: ${pendReceber.length} ${pendReceber.length > 1000 ? '<-- PASSA de 1.000: o crediário do PDV (sem paginação) mostra menos que a tela Fiados' : '— abaixo de 1.000, o corte ainda não morde aqui'}`)

  secao('8. TEXTO "DINHEIRO" NO CAIXA (achado C4)')
  const mov = await buscar('movimentos_caixa', 'id,caixa_id,tipo,forma_pagamento,valor,lancamento_id,origem')
  const textos = new Map()
  for (const m of mov) {
    const k = String(m.forma_pagamento ?? '(vazio)')
    if (!textos.has(k)) textos.set(k, { n: 0, valor: 0, tipos: new Set() })
    const g = textos.get(k); g.n++; g.valor += Number(m.valor ?? 0); g.tipos.add(m.tipo)
  }
  linha(`movimentos de caixa: ${mov.length}  ·  textos de forma diferentes: ${textos.size}`)
  for (const [k, g] of [...textos.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
    linha(`  ${String(g.n).padStart(6)}  ${brl(g.valor).padStart(16)}  "${k}"  [${[...g.tipos].join(',')}]${DINHEIRO(k) ? '' : '   (não é gaveta)'}`)
  }
  const quase = [...textos.keys()].filter((k) => DINHEIRO(k) && k.trim().toLowerCase() !== 'dinheiro')
  linha(`textos que CONTÊM "dinheiro" mas NÃO são exatamente "dinheiro": ${quase.length}${quase.length ? ' -> ' + quase.join(' | ') : ''}`)
  linha('(a função da gaveta procura "contém dinheiro"; lib/caixa.ts exige "exatamente dinheiro" — aqui é onde os dois se separam)')

  secao('9. CAIXAS')
  const caixas = await buscar('caixas', 'id,loja_id,status,valor_abertura,valor_fechamento,aberto_em,fechado_em')
  const abertos = caixas.filter((c) => c.status === 'aberto')
  linha(`caixas: ${caixas.length}  ·  abertos: ${abertos.length}  ·  fechados: ${caixas.filter((c) => c.status === 'fechado').length}`)
  for (const c of abertos) linha(`  aberto desde ${String(c.aberto_em).slice(0, 16).replace('T', ' ')}  ·  troco inicial ${brl(c.valor_abertura)}  ·  loja ${String(c.loja_id ?? '').slice(0, 8)}`)

  secao('RESUMO PARA LEVAR AO DONO')
  linha(`1. ${semHist.length + divergentes} pagamento(s) com histórico faltando ou torto — cliente não vê o que já pagou.`)
  linha(`2. ${diaDiferente.length} pagamento(s) (${brl(diaDiferente.reduce((s, l) => s + Number(l.valor ?? 0), 0))}) que mudam de dia conforme a tela que lê.`)
  linha(`3. ${semValorPago.length} lançamento(s) pago(s) sem valor_pago — relatório de "falta receber" inflado.`)
  linha(`4. ${semPessoaSemVenda.length} nota(s) de fiado sem cliente e sem venda (${brl(semPessoaSemVenda.reduce((s, l) => s + (Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)), 0))}) — só o dono resolve.`)
  linha(`5. ${cruzados.length} nome(s) com mais de um cadastro devendo — limite de crédito soma errado.`)

  if (process.argv.includes('--json')) {
    fs.writeFileSync('docs/registros-banco/dinheiro-diagnostico.json', JSON.stringify({ gerado_em: new Date().toISOString(), lancamentos: lanc.length, pago: pago.length, pendente: pend.length, sem_historico: semHist.length, dia_diferente: diaDiferente.length, sem_valor_pago: semValorPago.length, sem_pessoa_sem_venda: semPessoaSemVenda.length, nomes_cruzados: cruzados.length }, null, 2))
    console.log('\n(salvo em docs/registros-banco/dinheiro-diagnostico.json — só números, sem nome de pessoa)')
  }
}

main().catch((e) => { console.error('falhou:', e.message); process.exitCode = 1 })
