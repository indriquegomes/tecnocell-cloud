// puxa-crediario.mjs — captura o baseline de fiado (crediário) do SIGE.
//
// Fiado = lançamento A RECEBER ainda em aberto. Fonte: listagem de lançamentos
// do Financeiro (/v3/lancamentos/lancamentos), paginada por pagina.number
// (100/página). O filtro pede só "a receber + não pago" (tipoLancamento=1,
// situacaoLancamento='2'); o guarda ehFiado re-confirma Despesa=false e
// Pago=false por segurança — se o tipoLancamento vier trocado no SIGE, o guarda
// ainda salva só fiado (ou retorna vazio; aí teste 2).
//
// Uso: node scripts-sinc/puxa-crediario.mjs [--profile C:\caminho] [--out C:\caminho]
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const APP = 'https://app.sigecloud.com.br/'
const API = 'https://apiapp.sigecloud.com.br/v3/lancamentos/lancamentos'
const PERFIL_PADRAO = 'C:/Users/usuario/sige-profile'

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1] ?? ''; i++ }
  }
  return flags
}

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const montaCorpo = () => ({
  order: { ascending: true, fieldName: 'Cliente' },
  filtro: {
    projeto: '',
    dataFinal: hoje + 'T03:00:00.000Z',
    projetoId: '',
    filtrarPor: 'DataCompetencia',
    dataInicial: '2020-01-01T03:00:00.000Z', // janela larga: puxa TODO o histórico
    periodoData: 0,
    tipoLancamento: 1, // 0=todos, 1=a receber, 2=a pagar (fiado = a receber)
    pesquisaSimples: '',
    ehPesquisaSimples: false,
    situacaoLancamento: '2', // 2 = "Não Pago" (pendente)
  },
  pagina: { lenght: 100, number: 0 },
})

const ehFiado = (l) => l.Despesa !== true && l.Pago !== true // a receber + em aberto

const main = async () => {
  const flags = parseArgs(process.argv.slice(2))
  const perfil = flags.profile || PERFIL_PADRAO
  const corpo = montaCorpo()

  const ctx = await chromium.launchPersistentContext(perfil, { headless: true })
  const p = ctx.pages()[0] || await ctx.newPage()

  let auth = null
  p.on('request', (r) => {
    if (r.url().includes('apiapp') && r.headers()['authorization'] && !auth) auth = r.headers()['authorization']
  })
  await p.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(9000)

  if (!auth) {
    console.error('Não peguei token do SIGE. Perfil não logado ou app não carregou. Passe --profile com o perfil correto.')
    await ctx.close()
    process.exit(1)
  }

  const H = {
    authorization: auth,
    'content-type': 'application/json; charset=UTF-8',
    accept: 'application/json, text/plain, */*',
    referer: APP,
  }

  const todos = []
  for (let page = 0; page < 300; page++) {
    corpo.pagina.number = page
    const r = await p.request.post(API, { headers: H, data: corpo, timeout: 60000 }).catch(() => null)
    if (!r || !r.ok()) { console.error('HTTP ' + (r ? r.status() : 'erro') + ' na página ' + page); break }
    const j = await r.json()
    const itens = j.Data?.Itens || j.Data || []
    if (!Array.isArray(itens) || itens.length === 0) break
    const fiados = itens.filter(ehFiado)
    todos.push(...fiados)
    console.log('página ' + page + ' -> +' + itens.length + ' (' + fiados.length + ' fiados; total ' + todos.length + ')')
    if (itens.length < 100) break
  }

  await ctx.close()

  if (!todos.length) {
    console.error('Nenhum fiado retornado. Se tipoLancamento=1 vier errado, teste 2 em montaCorpo().')
    process.exit(1)
  }

  const outDir = flags.out || process.cwd()
  await mkdir(outDir, { recursive: true })
  const caminho = resolve(outDir, 'Crediario-' + hoje + '.json')
  await writeFile(caminho, JSON.stringify(todos))
  console.log('\nOK: ' + todos.length + ' fiados -> ' + caminho)
  console.log('CAMPOS: ' + Object.keys(todos[0]).join(', '))
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
