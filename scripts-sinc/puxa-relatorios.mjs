// A1b — agente de captura: puxa relatórios do SIGE (API do sistema mestre) e salva em JSON.
//
// Abre o perfil de login do SIGE num persistent context do Playwright, captura um
// token authorization FRESCO ouvindo uma request real pra apiapp.sigecloud.com.br
// (nunca token hardcoded), pagina o endpoint list-data por skip/limit e grava
// todas as linhas em <Relatorio>-<hoje>.json.
//
// Uso:   node scripts-sinc/puxa-relatorios.mjs <Relatorio> [opções]
//   Relatorio: Estoques | Pedidos | VendasPdv
//   --empresaID X          filtra por empresa (ID)
//   --dataInicial AAAA-MM-DD   (Pedidos e VendasPdv)
//   --dataFinal AAAA-MM-DD     (Pedidos e VendasPdv)
//   --profile C:\caminho   perfil de login do SIGE (default abaixo)
//   --out C:\caminho       pasta de saída (default: diretório atual)
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const APP = 'https://app.sigecloud.com.br/'
const API = 'https://apiapp.sigecloud.com.br'
const LIM = 1000
const PERFIL_PADRAO = 'C:/Users/usuario/sige-profile'

// Corpo default de cada relatório (capturado do front do SIGE).
const BODIES = {
  Estoques: {
    ascending: true, orderBy: 'Nome', saldoDiferenteZero: false, produto: '', produtoID: '',
  },
  Pedidos: {
    filtrarPor: 'Data', statusSistema: '', exibirPedidosCancelados: true, exibirPedidosComFiscalAtrelado: '',
    ascending: false, orderBy: 'Data', origemVenda: '', periodoData: 10, dataInicial: '', dataFinal: '',
    empresa: '', empresaID: '', cliente: '', clienteID: '', status: '', statusID: '',
    categoria: '', categoriaID: '', tabelaDePreco: '', tabelaDePrecoID: '',
  },
  VendasPdv: {
    filtrarPor: 'Data', ascending: false, orderBy: 'Data', exibirVendasCanceladas: true,
    periodoData: 10, dataInicial: '', dataFinal: '',
    empresa: '', empresaID: '', cliente: '', clienteID: '', vendedor: '', vendedorID: '',
    caixa: '', caixaID: '', deposito: '', depositoID: '',
  },
}

const USO = 'Uso: node scripts-sinc/puxa-relatorios.mjs <Estoques|Pedidos|VendasPdv> [--empresaID X] [--dataInicial AAAA-MM-DD] [--dataFinal AAAA-MM-DD] [--profile C:\\caminho] [--out C:\\caminho]'

function parseArgs(argv) {
  const rel = argv[0]
  const flags = {}
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i]
    if (k.startsWith('--')) { flags[k.slice(2)] = argv[i + 1] ?? ''; i++ }
  }
  return { rel, flags }
}

// AAAA-MM-DD -> meia-noite de São Paulo (UTC-3 = 03:00Z), formato que o SIGE manda.
const paraIso = (d) => (d ? `${d}T03:00:00.000Z` : '')

function montaBody(rel, flags) {
  const body = { ...BODIES[rel] }
  if (flags.empresaID !== undefined && flags.empresaID !== '') body.empresaID = flags.empresaID
  if ('dataInicial' in body) {
    if (flags.dataInicial) body.dataInicial = paraIso(flags.dataInicial)
    if (flags.dataFinal) body.dataFinal = paraIso(flags.dataFinal)
  }
  return body
}

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const main = async () => {
  const { rel, flags } = parseArgs(process.argv.slice(2))
  if (!BODIES[rel]) { console.error(USO); process.exit(1) }

  const perfil = flags.profile || PERFIL_PADRAO
  const body = montaBody(rel, flags)
  const endpoint = 'Report' + rel

  const ctx = await chromium.launchPersistentContext(perfil, { headless: true })
  const p = ctx.pages()[0] || await ctx.newPage()

  // Captura o token freso ouvindo uma request real do app pra API.
  let auth = null
  p.on('request', (r) => {
    if (r.url().includes('apiapp') && r.headers()['authorization'] && !auth) auth = r.headers()['authorization']
  })
  await p.goto(APP, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(9000)

  if (!auth) {
    console.error('Não peguei token do SIGE. O perfil não está logado ou o app não carregou. Passe --profile com o perfil de login correto.')
    await ctx.close()
    process.exit(1)
  }

  const H = {
    authorization: auth,
    'content-type': 'application/json; charset=UTF-8',
    accept: 'application/json, text/plain, */*',
    referer: APP,
  }

  let skip = 0
  const linhas = []
  for (;;) {
    const url = `${API}/v3/${endpoint}/list-data?skip=${skip}&limit=${LIM}`
    const r = await p.request.post(url, { headers: H, data: body, timeout: 60000 }).catch(() => null)
    if (!r) { console.error(`Erro de rede no skip ${skip}`); break }
    if (!r.ok()) { console.error(`HTTP ${r.status()} no skip ${skip}`); break }
    const j = await r.json()
    const arr = (j.Data && (j.Data.Dados || j.Data.Itens)) || j.Data || []
    if (!Array.isArray(arr) || arr.length === 0) break
    linhas.push(...arr)
    console.log(`  skip ${skip} -> +${arr.length} (total ${linhas.length})`)
    if (arr.length < LIM) break
    skip += LIM
    if (skip > 60000) break
  }

  await ctx.close()

  if (!linhas.length) { console.error('Nenhuma linha retornada.'); process.exit(1) }

  const outDir = flags.out || process.cwd()
  await mkdir(outDir, { recursive: true })
  const caminho = resolve(outDir, `${rel}-${hoje}.json`)
  await writeFile(caminho, JSON.stringify(linhas))
  console.log(`\n✅ ${rel} do SIGE: ${linhas.length} linhas -> ${caminho}`)
  console.log(`CAMPOS: ${Object.keys(linhas[0]).join(', ')}`)
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
