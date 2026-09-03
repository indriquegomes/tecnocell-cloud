// puxa-clientes.mjs — descobre e puxa a lista de clientes do SIGE (com SaldoValeCredito).
//
// O endpoint de clientes ainda não está mapeado (Fase 0), então o script tenta os
// DOIS padrões já confirmados no SIGE:
//   1) "grid" v3 (produtos/lançamentos): POST /v3/<entidade>/<entidade>, corpo com pagina.number;
//   2) "list-data" (relatórios): POST /v3/Report<X>/list-data?skip=0&limit=1000, corpo plano.
// Salva o primeiro que responder. Se nenhum responder, o script morre e pede pra olhar
// o DevTools (tela Clientes → POST de listagem) — aí a gente fixa a URL aqui.
//
// Salva somente campos necessários ao baseline. Cadastro bruto pode conter Senha/Salt.
//
// Uso: node scripts-sinc/puxa-clientes.mjs <profile-do-chrome-logado>
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const APP = 'https://app.sigecloud.com.br/'
const API = 'https://apiapp.sigecloud.com.br'

// Padrão grid: entidades candidatas (cliente no SIGE pode viver em "clientes" ou "pessoas").
const GRID = ['clientes/clientes', 'pessoas/pessoas', 'Cliente/Clientes', 'Clientes/Clientes', 'cliente/clientes']
// Padrão list-data: nomes de relatório candidatos.
const LISTDATA = ['ReportClientes', 'ReportPessoas', 'ReportCliente']

const itensDe = (j) => {
  if (Array.isArray(j)) return j
  if (!j || typeof j !== 'object') return null
  for (const k of ['Data', 'data', 'Itens', 'itens', 'Dados', 'dados', 'Resultado', 'resultado']) {
    const v = j[k]
    if (Array.isArray(v)) return v
    if (v && typeof v === 'object') {
      for (const k2 of ['Itens', 'itens', 'Dados', 'dados']) if (Array.isArray(v[k2])) return v[k2]
    }
  }
  return null
}

const numero = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const pedidoPessoaPDV = (c) => ({
  data: `${String(c.CNPJ_CPF ?? '').replace(/\D/g, '')} — ${String(c.NomeFantasia || c.RazaoSocial || '').trim()}`,
  arg: null,
})

export const limpaCliente = (c, saldo) => ({
  id: String(c.Id ?? ''),
  nome: String(c.NomeFantasia || c.RazaoSocial || '').trim(),
  cpfCnpj: String(c.CNPJ_CPF ?? '').replace(/\D/g, ''),
  saldoValeCredito: numero(saldo),
})

export const diretorioUserData = (perfil) => /^(Default|Profile \d+)$/i.test(basename(perfil)) ? dirname(perfil) : perfil

const dataSaoPaulo = () => {
  const partes = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((o, p) => ({ ...o, [p.type]: p.value }), {})
  return `${partes.year}-${partes.month}-${partes.day}`
}

const main = async () => {
  const PERFIL = process.argv[2]
  if (!PERFIL) { console.error('Uso: node scripts-sinc/puxa-clientes.mjs <profile>'); process.exit(1) }
  const ctx = await chromium.launchPersistentContext(diretorioUserData(PERFIL), { headless: true })
  const p = ctx.pages()[0] || (await ctx.newPage())
  let hdrs = null
  p.on('request', (r) => { if (r.url().includes('apiapp') && r.headers().authorization && !hdrs) hdrs = r.headers() })
  await p.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(9000)
  if (!hdrs) { console.error('Não peguei token — confirme que o perfil está logado no SIGE.'); await ctx.close(); process.exit(1) }
  const H = { authorization: hdrs.authorization, 'content-type': 'application/json; charset=UTF-8', accept: 'application/json, text/plain, */*', referer: APP }

  // 1) acha o endpoint que responde com lista de clientes.
  let modo = null // 'grid' | 'listdata'
  let urlOk = null
  let gridBody = { order: { ascending: true, fieldName: 'Nome' }, filtro: { pesquisaSimples: '', ehPesquisaSimples: false }, pagina: { lenght: 100, number: 0 } }

  for (const e of GRID) {
    const url = API + '/v3/' + e
    const r = await p.request.post(url, { headers: H, data: gridBody, timeout: 30000 }).catch(() => null)
    if (!r || !r.ok()) { console.log('x ' + url + ' -> HTTP ' + (r ? r.status() : 'erro')); continue }
    const itens = itensDe(await r.json().catch(() => null))
    if (Array.isArray(itens) && itens.length) { modo = 'grid'; urlOk = url; console.log('ok ' + url + ' -> ' + itens.length + ' na p.0'); break }
    console.log('x ' + url + ' -> vazio/outro formato')
  }
  if (!urlOk) {
    const flat = { ascending: true, orderBy: 'Nome', pesquisaSimples: '', ehPesquisaSimples: false }
    for (const nome of LISTDATA) {
      const url = API + '/v3/' + nome + '/list-data?skip=0&limit=1000'
      const r = await p.request.post(url, { headers: H, data: flat, timeout: 30000 }).catch(() => null)
      if (!r || !r.ok()) { console.log('x ' + url + ' -> HTTP ' + (r ? r.status() : 'erro')); continue }
      const itens = itensDe(await r.json().catch(() => null))
      if (Array.isArray(itens) && itens.length) { modo = 'listdata'; urlOk = url; console.log('ok ' + url + ' -> ' + itens.length); break }
      console.log('x ' + url + ' -> vazio/outro formato')
    }
  }
  if (!urlOk) {
    console.error('Nenhum candidato respondeu. Abra o SIGE -> tela Clientes -> DevTools (F12) -> Network -> filtre "apiapp", ache o POST de listagem e me passe URL + Request Payload.')
    await ctx.close()
    process.exit(1)
  }

  // 2) pagina até esgotar.
  const todos = []
  for (let page = 0; page < 300; page++) {
    let r
    if (modo === 'grid') {
      gridBody.pagina.number = page
      r = await p.request.post(urlOk, { headers: H, data: gridBody, timeout: 60000 }).catch(() => null)
    } else {
      r = await p.request.post(urlOk.replace(/skip=\d+/, 'skip=' + (page * 1000)), { headers: H, data: { ascending: true, orderBy: 'Nome', pesquisaSimples: '', ehPesquisaSimples: false }, timeout: 60000 }).catch(() => null)
    }
    if (!r || !r.ok()) { console.error('HTTP ' + (r ? r.status() : 'erro') + ' na página ' + page); break }
    const itens = itensDe(await r.json().catch(() => null)) || []
    if (!itens.length) break
    todos.push(...itens)
    console.log('página ' + page + ' -> +' + itens.length + ' (total ' + todos.length + ')')
    if (itens.length < (modo === 'grid' ? 100 : 1000)) break
  }
  if (!todos.length) { console.error('Nenhum cliente retornado.'); process.exit(1) }

  const clientes = []
  let pulados = 0
  for (const cliente of todos) {
    const r = await p.request.post(API + '/v2/pessoa/GetPessoaPDV', {
      headers: H, data: pedidoPessoaPDV(cliente), timeout: 30000,
    }).catch(() => null)
    const detalhe = r?.ok() ? await r.json().catch(() => null) : null
    if (detalhe?.Encontrou !== true) { pulados++; continue }
    clientes.push(limpaCliente(cliente, detalhe.SaldoValeCredito))
    if (clientes.length % 100 === 0) console.log('saldo PDV: ' + clientes.length + '/' + todos.length)
  }
  await ctx.close()

  const out = 'Clientes-' + dataSaoPaulo() + '.json'
  writeFileSync(out, JSON.stringify(clientes))
  console.log('\nOK: ' + clientes.length + ' clientes -> ' + out)
  console.log('ENDPOINT: ' + urlOk + ' (modo ' + modo + ')')
  console.log('CAMPOS: id, nome, cpfCnpj, saldoValeCredito')
  console.log('COM SALDO VALE > 0: ' + clientes.filter((c) => c.saldoValeCredito > 0).length)
  console.log('PULADOS: ' + pulados)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
}
