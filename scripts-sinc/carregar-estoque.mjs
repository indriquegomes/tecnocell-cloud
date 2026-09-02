// Fase 3 — carregador de baseline do estoque SIGE -> TecnoCell.
//
// Lê o JSON que o scripts-sinc/puxa-relatorios.mjs Estoques grava (array de
// linhas do ReportEstoques) e faz UPSERT em "estoque" via Supabase REST com a
// service role (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Idempotente:
// on conflict (produto_id, deposito_id) -> atualiza quantidade. NUNCA apaga
// linha nem depósito. Linha com produto/depósito que não existe aqui é PULADA
// (não quebra o lote, não inventa cadastro) e contada no resumo.
//
// Uso:   node scripts-sinc/carregar-estoque.mjs <arquivo.json>
//        (sem argumento, procura o Estoques-*.json mais novo no diretório atual)
import { readFile, readdir } from 'node:fs/promises'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── de-para de campos do ReportEstoques (SIGE) ── CONFIRMAR COM O DONO.
// Os ObjectIds batem DIRETO com produtos.id / depositos.id (cadastro importado
// com o MESMO id; ex.: depósito Petrópolis Loja = 63d9054d59a9c829747233d4).
const CAMPOS = {
  produto: 'produtoID',     // confirmar com o dono (ObjectId do produto)
  deposito: 'depositoID',   // confirmar com o dono (ObjectId do depósito)
  quantidade: 'quantidade', // confirmar com o dono (saldo; pode ser "saldo"/"estoque")
}

const BATCH = 1000

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const rest = async (path) => {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    },
  })
  if (!r.ok()) throw new Error('HTTP ' + r.status + ' em ' + path)
  return r.json()
}

// Pagina todos os ids de uma tabela (select=id, order=id, offset). O estoque
// usa FK pra produtos/depósitos, então precisamos dos ids que existem aqui.
async function idsExistentes(tabela) {
  const ids = new Set()
  let offset = 0
  for (;;) {
    const linhas = await rest(tabela + '?select=id&order=id&limit=1000&offset=' + offset)
    for (const l of linhas) ids.add(l.id)
    if (linhas.length < 1000) break
    offset += linhas.length
  }
  return ids
}

async function upsert(linhas) {
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/estoque?on_conflict=produto_id,deposito_id',
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(linhas),
    },
  )
  if (!r.ok()) throw new Error('HTTP ' + r.status + ' no upsert de ' + linhas.length + ' linhas')
}

const hojeSP = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const main = async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.')
    process.exit(1)
  }

  let arquivo = process.argv[2]
  if (!arquivo) {
    const arquivos = (await readdir('.')).filter((f) => /^Estoques-.*\.json$/.test(f)).sort()
    arquivo = arquivos[arquivos.length - 1]
  }
  if (!arquivo) {
    console.error('Nenhum Estoques-*.json encontrado. Passe o caminho do arquivo.')
    process.exit(1)
  }

  const linhas = JSON.parse(await readFile(arquivo, 'utf8'))
  if (!Array.isArray(linhas) || linhas.length === 0) {
    console.error(arquivo + ': não é um array de linhas do ReportEstoques.')
    process.exit(1)
  }

  const [produtos, depositos] = await Promise.all([idsExistentes('produtos'), idsExistentes('depositos')])

  const agora = new Date().toISOString()
  let ok = 0
  let puladas = 0
  let lote = []
  const flush = async () => {
    if (!lote.length) return
    await upsert(lote)
    ok += lote.length
    lote = []
  }

  for (const l of linhas) {
    const produto = String(l[CAMPOS.produto] ?? '')
    const deposito = String(l[CAMPOS.deposito] ?? '')
    const quantidade = num(l[CAMPOS.quantidade])
    if (!produto || !deposito || quantidade === null || !produtos.has(produto) || !depositos.has(deposito)) {
      puladas++
      continue
    }
    lote.push({ produto_id: produto, deposito_id: deposito, quantidade, updated_at: agora })
    if (lote.length >= BATCH) await flush()
  }
  await flush()

  console.log('Arquivo: ' + arquivo + ' (linhas: ' + linhas.length + ')')
  console.log('Upsert: ' + ok + ' linhas | puladas: ' + puladas + ' | depósitos: ' + depositos.size + ' | produtos: ' + produtos.size)
  console.log('Fuso: America/Sao_Paulo (' + hojeSP() + ')')
}

main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
