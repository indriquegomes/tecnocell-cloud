// Puxa TODOS os produtos do SIGE (/v3/produtos/produtos) e salva JSON.
// Paginação por pagina.number (100 por página). Salva o JSON completo + imprime
// os CAMPOS do primeiro item pra montar o carregador.
//
// Uso: node scripts-sinc/puxa-produtos.mjs <profile-do-chrome-logado>
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const APP = 'https://app.sigecloud.com.br/'
const URL = 'https://apiapp.sigecloud.com.br/v3/produtos/produtos'

const PERFIL = process.argv[2]
if (!PERFIL) { console.error('Uso: node scripts-sinc/puxa-produtos.mjs <profile>'); process.exit(1) }

const corpo = {
  order: { ascending: false, fieldName: 'Codigo' },
  filtro: { tipo: '', marca: '', types: [], genero: '', atributo: '', categoria: '', codigoEAN: '', fornecedor: '', prateleira: '', categoriaId: '', invalidGenre: [], cadastroInativo: false, pesquisaSimples: '', possuiComposicao: false, ehPesquisaSimples: false, somenteComEstoque: false },
  pagina: { lenght: 100, number: 0 },
}

;(async () => {
  const ctx = await chromium.launchPersistentContext(PERFIL, { headless: true })
  const p = ctx.pages()[0] || (await ctx.newPage())
  let hdrs = null
  p.on('request', (r) => { if (r.url().includes('apiapp') && r.headers().authorization && !hdrs) hdrs = r.headers() })
  await p.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(9000)
  if (!hdrs) { console.error('Não peguei token — confirme que o perfil está logado no SIGE.'); await ctx.close(); process.exit(1) }
  const H = { authorization: hdrs.authorization, 'content-type': 'application/json; charset=UTF-8', accept: 'application/json, text/plain, */*', referer: APP }

  const todos = []
  for (let page = 0; page < 300; page++) {
    corpo.pagina.number = page
    const r = await p.request.post(URL, { headers: H, data: corpo, timeout: 60000 }).catch(() => null)
    if (!r || !r.ok) { console.error('HTTP ' + (r ? r.status() : 'erro') + ' na página ' + page); break }
    const j = await r.json()
    const itens = j.Data?.Itens || j.Data || []
    if (!Array.isArray(itens) || itens.length === 0) break
    todos.push(...itens)
    console.log('página ' + page + ' -> +' + itens.length + ' (total ' + todos.length + ')')
    if (itens.length < 100) break
  }
  await ctx.close()

  const out = 'Produtos-' + new Date().toISOString().slice(0, 10) + '.json'
  writeFileSync(out, JSON.stringify(todos))
  console.log('\nOK: ' + todos.length + ' produtos -> ' + out)
  console.log('CAMPOS: ' + Object.keys(todos[0] || {}).join(', '))
})().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
