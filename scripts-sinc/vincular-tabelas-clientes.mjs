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

const texto = (valor) => String(valor ?? '').trim()
const documento = (valor) => texto(valor).replace(/\D/g, '')
const tabelasPadrao = new Set(['', '---', 'VAREJO', 'ESTOQUE GERAL'])

export function planejarVinculos({ linhas, pessoas, tabelas }) {
  const porId = new Map(pessoas.map((p) => [p.id, p]))
  const porCpf = new Map()
  for (const pessoa of pessoas) {
    const cpf = documento(pessoa.cpf_cnpj)
    if (cpf) porCpf.set(cpf, porCpf.has(cpf) ? null : pessoa)
  }
  const tabelaId = new Map(tabelas.map((t) => [texto(t.nome).toUpperCase(), t.id]))
  const escolhidos = new Map()
  const conflitos = []
  const duplicatas = []
  let clientesFonte = 0

  for (const linha of linhas) {
    if (texto(linha.cliente).toUpperCase() !== 'SIM') continue
    clientesFonte++
    const tabela = texto(linha.tabelaPreco).toUpperCase()
    if (!tabelasPadrao.has(tabela) && tabela !== 'ATACADO1' && tabela !== 'ATACADO2') {
      conflitos.push({ linha: linha.linha, motivo: `tabela ${tabela} não reconhecida` })
      continue
    }
    const destino = tabelasPadrao.has(tabela) ? null : tabelaId.get(tabela)
    if (!tabelasPadrao.has(tabela) && !destino) {
      conflitos.push({ linha: linha.linha, motivo: `tabela ${tabela} não existe` })
      continue
    }

    const original = texto(linha.identificador)
    const base = idPessoa(original)
    const cpf = documento(linha.cpfCnpj)
    const pessoa = (base && porId.get(base))
      || (/^[a-f\d]{24}idpessoa$/i.test(original) && porId.get(original))
      || (cpf && porCpf.get(cpf))
    if (!pessoa) {
      conflitos.push({ linha: linha.linha, id: base, motivo: 'pessoa não encontrada' })
      continue
    }
    if (!['cliente', 'ambos'].includes(pessoa.tipo)) {
      conflitos.push({ linha: linha.linha, id: pessoa.id, motivo: 'cadastro não é cliente' })
      continue
    }

    const tabelaFinal = destino ? tabela : 'PREÇO PADRÃO'
    const anterior = escolhidos.get(pessoa.id)
    if (anterior) {
      if (anterior.para !== destino) conflitos.push({ linha: linha.linha, id: pessoa.id, motivo: 'mesmo cliente com tabelas diferentes' })
      else duplicatas.push({ linha: linha.linha, id: pessoa.id })
      continue
    }
    escolhidos.set(pessoa.id, {
      id: pessoa.id,
      nome: pessoa.nome,
      de: pessoa.tabela_preco_id ?? null,
      para: destino ?? null,
      tabela: tabelaFinal,
    })
  }

  const vinculos = [...escolhidos.values()]
  const mudancas = vinculos.filter((v) => v.de !== v.para)
  const iguais = vinculos.filter((v) => v.de === v.para)
  const porTabelaFinal = { ATACADO1: 0, ATACADO2: 0, 'PREÇO PADRÃO': 0 }
  for (const vinculo of vinculos) porTabelaFinal[vinculo.tabela]++
  return {
    vinculos, mudancas, iguais, duplicatas, conflitos,
    resumo: {
      clientesFonte,
      clientesUnicos: vinculos.length,
      mudancas: mudancas.length,
      iguais: iguais.length,
      duplicatas: duplicatas.length,
      conflitos: conflitos.length,
      porTabelaFinal,
    },
  }
}

const uuidSql = (valor) => {
  if (valor == null) return 'null'
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(valor)) throw new Error(`UUID inválido: ${valor}`)
  return `'${valor}'::uuid`
}

export function sqlTransacao(mudancas) {
  if (!mudancas.length) throw new Error('Nenhuma mudança para aplicar.')
  const valores = mudancas.map((m) => {
    if (!/^[a-f\d]{24}(?:idpessoa)?$/i.test(m.id)) throw new Error(`ID inválido: ${m.id}`)
    return `('${m.id}', ${uuidSql(m.de)}, ${uuidSql(m.para)})`
  }).join(',\n')
  return `begin;
create temporary table vinculos_clientes_importacao (
  id text primary key,
  valor_anterior uuid,
  valor_novo uuid
) on commit drop;
insert into vinculos_clientes_importacao values
${valores};
do $$
begin
  if exists (
    select 1
    from vinculos_clientes_importacao v
    left join pessoas p on p.id = v.id
    where p.id is null or p.tabela_preco_id is distinct from v.valor_anterior
  ) then
    raise exception 'Cadastro ausente ou alterado após o dry-run.';
  end if;
end $$;
update pessoas p
set tabela_preco_id = v.valor_novo
from vinculos_clientes_importacao v
where p.id = v.id;
commit;`
}

export function projectRefDaUrl(url) {
  const match = new URL(url).hostname.match(/^([a-z\d]+)\.supabase\.co$/i)
  if (!match) throw new Error(`URL Supabase inválida: ${url}`)
  return match[1]
}

export function validarProjetoBackup(backup, url) {
  if (!backup.projectRef) throw new Error('Backup não informa o projeto Supabase.')
  if (backup.projectRef !== projectRefDaUrl(url)) throw new Error('Backup pertence a projeto diferente do ambiente atual.')
}

function envLocal() {
  try {
    return Object.fromEntries(readFileSync('.env.local', 'utf8').replace(/^\ufeff/, '').split(/\r?\n/)
      .map((linha) => linha.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
  } catch { return {} }
}

async function main() {
  const rollbackPos = process.argv.indexOf('--rollback')
  if (rollbackPos >= 0) {
    const caminho = process.argv[rollbackPos + 1]
    if (!caminho) throw new Error('Uso: node scripts-sinc/vincular-tabelas-clientes.mjs --rollback backup.json')
    const backup = JSON.parse(readFileSync(caminho, 'utf8'))
    const reversao = backup.mudancas.map((m) => ({ id: m.id, de: m.para, para: m.de }))
    const env = envLocal()
    const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    if (!url) throw new Error('Falta SUPABASE_URL.')
    validarProjetoBackup(backup, url)
    await executarSqlGerenciamento(sqlTransacao(reversao), url)
    console.log(`Rollback aplicado: ${reversao.length} clientes.`)
    return
  }

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
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(arquivo)
  const ws = wb.worksheets[0]
  const headersXlsx = new Map(ws.getRow(1).values.slice(1).map((v, i) => [String(v).trim(), i + 1]))
  const cId = headersXlsx.get('Identificador')
  const cTabela = headersXlsx.get('TabelaPreco')
  const cCpf = headersXlsx.get('CNPJ_CPF')
  const cCliente = headersXlsx.get('Cliente')
  const cNome = headersXlsx.get('NomeFantasia')
  const cRazao = headersXlsx.get('RazaoSocial')
  if (!cId || !cTabela || !cCliente) throw new Error('Colunas Cliente/Identificador/TabelaPreco não encontradas.')

  const linhas = []
  for (let n = 2; n <= ws.rowCount; n++) {
    linhas.push({
      linha: n,
      cliente: ws.getCell(n, cCliente).value,
      identificador: ws.getCell(n, cId).value,
      cpfCnpj: cCpf ? ws.getCell(n, cCpf).value : null,
      nome: (cNome && ws.getCell(n, cNome).value) || (cRazao && ws.getCell(n, cRazao).value),
      tabelaPreco: ws.getCell(n, cTabela).value,
    })
  }

  const plano = planejarVinculos({ linhas, pessoas, tabelas })
  console.log(JSON.stringify({ modo: aplicar ? 'APPLY' : 'DRY-RUN', arquivo, ...plano.resumo,
    amostraConflitos: plano.conflitos.slice(0, 20) }, null, 2))
  if (!aplicar) return

  const esperado = plano.resumo.clientesUnicos === 1997
    && plano.resumo.mudancas === 1658
    && plano.resumo.iguais === 339
    && plano.resumo.duplicatas === 2
    && plano.resumo.conflitos === 0
    && plano.resumo.porTabelaFinal.ATACADO1 === 1544
    && plano.resumo.porTabelaFinal.ATACADO2 === 115
    && plano.resumo.porTabelaFinal['PREÇO PADRÃO'] === 338
  if (!esperado) throw new Error('Aplicação bloqueada: contagens diferem do dry-run aprovado.')

  await mkdir('backups', { recursive: true })
  const backup = `backups/vinculo-tabelas-clientes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  await writeFile(backup, JSON.stringify({ criadoEm: new Date().toISOString(), projectRef: projectRefDaUrl(url), arquivo, resumo: plano.resumo, mudancas: plano.mudancas }, null, 2))
  await executarSqlGerenciamento(sqlTransacao(plano.mudancas), url)
  console.log(`Aplicados: ${plano.mudancas.length}. Backup: ${backup}`)
}

async function executarSqlGerenciamento(query, url) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('Falta SUPABASE_ACCESS_TOKEN para aplicar ou reverter.')
  const projectRef = projectRefDaUrl(url)
  const resposta = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!resposta.ok) throw new Error(`Falha transacional: HTTP ${resposta.status} ${await resposta.text()}`)
  return resposta.json()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e.message); process.exit(1) })
