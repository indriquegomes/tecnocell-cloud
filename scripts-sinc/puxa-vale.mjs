// puxa-vale.mjs — baseline de vale-crédito: consulta SaldoValeCredito de TODOS os clientes.
//
// Fonte confirmada: POST /v2/pessoa/GetPessoaPDV
// Payload: { data: "<Id> — <NomeFantasia>", arg: null }  (Id = ObjectId da listagem /v3/pessoas/pessoas)
// Resposta completa: { Id, Nome, CPFCNPJ, SaldoValeCredito, SaldoCashBack, Encontrou, ... }.
//
// A listagem /v3/pessoas/pessoas NÃO traz CPF (CNPJ_CPF vem vazio), mas traz Id.
// GetPessoaPDV acha por "Id — NomeFantasia" e devolve o CPF + saldos na resposta.
//
// Rate limit do SIGE: 500 req/min (header x-ratelimit-limit). O script PACEIA a
// ~450 req/min e faz retry com backoff em 429. ~2714 clientes => ~6 min.
//
// Uso:
//   node scripts-sinc/puxa-vale.mjs --token "Bearer ..."        (recomendado)
//   node scripts-sinc/puxa-vale.mjs --profile C:\caminho        (captura token do perfil logado)
//   --in Clientes-X.json   entrada (default: o Clientes-*.json mais recente)
//   --out Vales-X.json     saída

import { chromium } from 'playwright'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const APP = 'https://app.sigecloud.com.br/'
const API = 'https://apiapp.sigecloud.com.br/v2/pessoa/GetPessoaPDV'
const PERFIL_PADRAO = 'C:/Users/usuario/sige-profile'
const SEP = ' — ' // em-dash com espaços (igual o payload real)
const ESPERA_MS = 130 // ~460 req/min, folga sob o limite de 500

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1] ?? ''; i++ }
  }
  return flags
}
const flags = parseArgs(process.argv.slice(2))
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function achaArquivoClientes() {
  if (flags.in) return flags.in
  const fs = (await readdir('.')).filter((f) => /^Clientes-.*\.json$/.test(f)).sort()
  return fs[fs.length - 1]
}

;(async () => {
  const arqIn = await achaArquivoClientes()
  if (!arqIn || !existsSync(arqIn)) { console.error('Nenhum Clientes-*.json. Rode puxa-clientes.mjs primeiro (ou --in).'); process.exit(1) }
  const clientes = JSON.parse(await readFile(arqIn, 'utf8'))
  console.log('Clientes: ' + clientes.length + ' (de ' + arqIn + ')')

  // ---- token ----
  let token = flags.token || process.env.SIGE_TOKEN
  let browserCtx = null
  if (!token) {
    const perfil = flags.profile || PERFIL_PADRAO
    console.log('Sem --token. Abrindo perfil ' + perfil + ' ...')
    browserCtx = await chromium.launchPersistentContext(perfil, { headless: true })
    const p = browserCtx.pages()[0] || (await browserCtx.newPage())
    p.on('request', (r) => {
      const auth = r.headers()['authorization'] || r.headers()['Authorization']
      if (r.url().includes('apiapp') && auth && !token) token = auth
    })
    await p.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await p.waitForTimeout(9000)
    if (p.url().includes('Login.aspx')) console.error('AVISO: perfil redirecionou pro login (não logado).')
  }
  if (!token) { if (browserCtx) await browserCtx.close(); console.error('\nSem token. Rode com --token "Bearer ...".'); process.exit(1) }
  if (!token.startsWith('Bearer ') && !token.startsWith('bearer ')) token = 'Bearer ' + token
  const H = { authorization: token, 'content-type': 'application/json; charset=UTF-8', accept: 'application/json, text/plain, */*', referer: APP }

  async function getPessoa(id, nome) {
    const data = nome ? (id + SEP + nome) : String(id)
    for (let t = 0; t < 6; t++) {
      try {
        const r = await fetch(API, { method: 'POST', headers: H, body: JSON.stringify({ data, arg: null }) })
        if (r.status === 429) { await sleep((Number(r.headers.get('retry-after') || '2') + 1) * 1000); continue }
        if (!r.ok) return null
        return await r.json().catch(() => null)
      } catch { await sleep(1500) }
    }
    return null
  }

  const comVale = []
  let encontrados = 0, naoAchou = 0, erros = 0, semId = 0

  for (let i = 0; i < clientes.length; i++) {
    const c = clientes[i]
    if (!c.Id) { semId++; continue }
    const nome = c.NomeFantasia ?? c.RazaoSocial ?? ''
    const j = await getPessoa(c.Id, nome)
    if (!j) { erros++; }
    else if (j.Encontrou !== true) { naoAchou++; }
    else {
      encontrados++
      const vale = Math.round((Number(j.SaldoValeCredito ?? 0) || 0) * 100) / 100
      const cash = Math.round((Number(j.SaldoCashBack ?? 0) || 0) * 100) / 100
      if (vale > 0 || cash > 0) {
        comVale.push({ id: j.Id ?? c.Id, nome: j.Nome ?? nome, cpfCnpj: j.CPFCNPJ ?? null, saldoValeCredito: vale, saldoCashBack: cash })
      }
    }
    if ((i + 1) % 100 === 0) process.stdout.write('progresso ' + (i + 1) + '/' + clientes.length + ' (vale ' + comVale.length + ', err ' + erros + ')\r')
    await sleep(ESPERA_MS)
  }
  console.log('\n=== RESULTADO ===')
  console.log('total ' + clientes.length + ' | encontrados ' + encontrados + ' | não achou ' + naoAchou + ' | erros ' + erros + ' | sem Id ' + semId)
  console.log('com vale/cash > 0: ' + comVale.length)

  const arqOut = flags.out || ('Vales-' + hoje + '.json')
  await writeFile(arqOut, JSON.stringify(comVale), 'utf8')
  console.log('salvo -> ' + arqOut)

  if (browserCtx) await browserCtx.close()
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
