import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const normalizarTabela = (valor) => {
  const nome = String(valor ?? '').trim().toUpperCase()
  return nome === 'ATACADO1' || nome === 'ATACADO2' ? nome : null
}

export const idPessoa = (valor) => {
  const id = String(valor ?? '').replace(/idpessoa$/i, '').trim()
  return /^[a-f\d]{24}$/i.test(id) ? id : null
}

export const normalizarNome = (valor) => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

function envLocal() {
  try {
    return Object.fromEntries(readFileSync('.env.local', 'utf8').replace(/^\ufeff/, '').split(/\r?\n/)
      .map((linha) => linha.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
  } catch { return {} }
}

async function main() {
  const arquivo = process.argv.find((a) => /\.xlsx$/i.test(a))
  const aplicar = process.argv.includes('--apply')
  if (!arquivo) throw new Error('Uso: node scripts-sinc/vincular-tabelas-clientes.mjs arquivo.xlsx [--apply]')
  const env = envLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
  const headers = { apikey: key, authorization: `Bearer ${key}` }
  const get = async (path) => {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers })
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
    return r.json()
  }
  const pessoas = []
  for (let offset = 0;; offset += 1000) {
    const lote = await get(`pessoas?select=id,nome,cpf_cnpj,tipo,tabela_preco_id&limit=1000&offset=${offset}`)
    pessoas.push(...lote)
    if (lote.length < 1000) break
  }
  const tabelas = await get('tabelas_preco?select=id,nome&ativa=eq.true')
  const tabelaId = new Map(tabelas.map((t) => [String(t.nome).toUpperCase(), t.id]))
  const porId = new Map(pessoas.map((p) => [p.id, p]))
  const unicos = (campo) => {
    const mapa = new Map()
    for (const p of pessoas) {
      const chave = campo(p)
      if (!chave) continue
      mapa.set(chave, mapa.has(chave) ? null : p)
    }
    return mapa
  }
  const porCpf = unicos((p) => String(p.cpf_cnpj ?? '').replace(/\D/g, ''))
  const porNome = unicos((p) => normalizarNome(p.nome))

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(arquivo)
  const ws = wb.worksheets[0]
  const headersXlsx = new Map(ws.getRow(1).values.slice(1).map((v, i) => [String(v).trim(), i + 1]))
  const cId = headersXlsx.get('Identificador')
  const cTabela = headersXlsx.get('TabelaPreco')
  const cCpf = headersXlsx.get('CNPJ_CPF')
  const cNome = headersXlsx.get('NomeFantasia')
  const cRazao = headersXlsx.get('RazaoSocial')
  if (!cId || !cTabela) throw new Error('Colunas Identificador/TabelaPreco não encontradas.')

  const mudancas = []; const conflitos = []
  for (let n = 2; n <= ws.rowCount; n++) {
    const id = idPessoa(ws.getCell(n, cId).value)
    const origem = String(ws.getCell(n, cTabela).value ?? '').trim()
    const cpf = String(cCpf ? ws.getCell(n, cCpf).value ?? '' : '').replace(/\D/g, '')
    const nome = normalizarNome((cNome && ws.getCell(n, cNome).value) || (cRazao && ws.getCell(n, cRazao).value))
    const pessoa = (id && porId.get(id)) || (cpf && porCpf.get(cpf)) || (nome && porNome.get(nome))
    if (!pessoa) { conflitos.push({ linha: n, id, motivo: 'pessoa não encontrada' }); continue }
    if (!['cliente', 'ambos'].includes(pessoa.tipo)) continue
    const nomeTabela = normalizarTabela(origem)
    const destino = nomeTabela ? tabelaId.get(nomeTabela) : null
    if (nomeTabela && !destino) { conflitos.push({ linha: n, id, motivo: `tabela ${nomeTabela} não existe` }); continue }
    if ((pessoa.tabela_preco_id ?? null) !== destino) mudancas.push({ id: pessoa.id, nome: pessoa.nome, de: pessoa.tabela_preco_id, para: destino, tabela: nomeTabela ?? 'PREÇO PADRÃO' })
  }

  const porTabela = mudancas.reduce((acc, m) => ({ ...acc, [m.tabela]: (acc[m.tabela] ?? 0) + 1 }), {})
  console.log(JSON.stringify({ modo: aplicar ? 'APPLY' : 'DRY-RUN', arquivo, mudancas: mudancas.length, conflitos: conflitos.length,
    porTabela, amostraConflitos: conflitos.slice(0, 20) }, null, 2))
  if (!aplicar || mudancas.length === 0) return

  await mkdir('backups', { recursive: true })
  const backup = `backups/vinculo-tabelas-clientes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  await writeFile(backup, JSON.stringify(mudancas, null, 2))
  for (const m of mudancas) {
    const r = await fetch(`${url}/rest/v1/pessoas?id=eq.${m.id}`, {
      method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ tabela_preco_id: m.para }),
    })
    if (!r.ok) throw new Error(`Falha em ${m.id}: HTTP ${r.status} ${await r.text()}`)
  }
  console.log(`Aplicados: ${mudancas.length}. Backup: ${backup}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e.message); process.exit(1) })
