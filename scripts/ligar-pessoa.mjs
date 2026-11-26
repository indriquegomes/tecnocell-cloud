// LIGA OS LANÇAMENTOS À PESSOA DO CADASTRO (pessoa_id). SÓ LÊ + grava o vínculo.
//
//   node --env-file=.env.local scripts/ligar-pessoa.mjs            (ensaio)
//   node --env-file=.env.local scripts/ligar-pessoa.mjs --aplicar  (grava)
//
// As contas de devolução criadas à mão no Financeiro ficaram sem `pessoa_id` — só
// com o nome digitado. Sem o vínculo, o cliente não vê a devolução na ficha dele e
// nenhum relatório por cliente acha. Este script procura a pessoa no cadastro pelo
// nome (mesma régua do cruzamento: sem acento, sem CNPJ na frente, por token) e
// grava o id quando o casamento é ÚNICO.
//
// O que NÃO faz: não muda nome, valor, forma, conta, status nem devolução. Só
// `pessoa_id`. Nome ambíguo (2+ cadastros parecidos) fica de fora e é listado.
import fs from 'node:fs'
import path from 'node:path'
import { nomeContido, normNome } from './lib-nome-extrato.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou env'); process.exit(1) }
const aplicar = process.argv.includes('--aplicar')
const h = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' }
const get = async (p) => { const r = await fetch(`${url}/rest/v1/${p}`, { headers: h }); const j = await r.json(); return Array.isArray(j) ? j : [] }
const brl = (v) => 'R$ ' + Number(v ?? 0).toFixed(2).replace('.', ',')

const provas = await get(`pix_saidas?select=lancamento_id,valor&lancamento_id=not.is.null&limit=100`)
const ids = [...new Set(provas.map((p) => p.lancamento_id))]
const contas = await get(`lancamentos?select=id,valor,descricao,pessoa_nome,pessoa_id,tipo&id=in.(${ids.join(',')})&limit=200`)

const todasPessoas = []
for (let off = 0; off < 40000; off += 1000) {
  const pg = await get(`pessoas?select=id,nome,cpf_cnpj&order=id&limit=1000&offset=${off}`)
  todasPessoas.push(...pg)
  if (pg.length < 1000) break
}

const nomeDoLancamento = (c) =>
  String(c.pessoa_nome ?? '').trim() ||
  String(c.descricao ?? '')
    .replace(/^(Devolu[çc][ãa]o|Estorno de cr[ée]dito)[^—–-]*[—–-]\s*/i, '')
    .replace(/\s*\((estorno|compra)[^)]*\)\s*$/i, '')
    .trim()

const ligar = []
const ambiguos = []
const naoAchados = []

for (const c of contas) {
  if (c.pessoa_id) continue
  const nome = nomeDoLancamento(c)
  if (!nome) continue
  const tokens = normNome(nome).split(' ').filter((t) => t.length >= 4)
  if (!tokens.length) { naoAchados.push({ c, nome, motivo: 'nome sem token útil' }); continue }
  // compara contra o cadastro INTEIRO, em memória: buscar por token no banco falha
  // com acento ("CONCEICAO" não acha "CONCEIÇÃO") e devolve falso negativo.
  const fortes = todasPessoas.filter((p) => nomeContido(nome, p.nome))
  if (fortes.length === 1) ligar.push({ c, nome, pessoa: fortes[0] })
  else if (fortes.length > 1) ambiguos.push({ c, nome, candidatos: fortes })
  else naoAchados.push({ c, nome, motivo: 'nenhum cadastro com esse nome dentro do outro' })
}

console.log(`\n=== PARA LIGAR (lançamento → pessoa): ${ligar.length} ===`)
for (const x of ligar) {
  console.log(`  ${brl(x.c.valor).padEnd(11)} · '${String(x.nome).slice(0, 32).padEnd(32)}' → ${x.pessoa.nome} · ${x.pessoa.cpf_cnpj ?? 'sem doc'}`)
}
console.log(`\n=== AMBÍGUO (fica fora): ${ambiguos.length} ===`)
for (const x of ambiguos) console.log(`  ${brl(x.c.valor).padEnd(11)} · '${x.nome}' → ${x.candidatos.map((p) => p.nome).join(' | ')}`)
console.log(`\n=== SEM CADASTRO: ${naoAchados.length} ===`)
for (const x of naoAchados) console.log(`  ${brl(x.c.valor).padEnd(11)} · '${x.nome}' — ${x.motivo}`)

if (!aplicar) {
  console.log(`\n(ensaio: nada gravado. --aplicar liga os ${ligar.length}.)`)
  process.exit(0)
}

const dir = path.join('docs', 'registros-banco', '2026-11')
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, `ligar-pessoa-${Date.now()}.json`)
fs.writeFileSync(arquivo, JSON.stringify(ligar.map((x) => ({ lancamento_id: x.c.id, valor: x.c.valor, nome_no_lancamento: x.nome, pessoa_id: x.pessoa.id, pessoa_nome: x.pessoa.nome, cpf: x.pessoa.cpf_cnpj })), null, 2), 'utf8')
console.log(`\nbackup: ${arquivo}`)

let ok = 0
for (const x of ligar) {
  const r = await fetch(`${url}/rest/v1/lancamentos?id=eq.${x.c.id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ pessoa_id: x.pessoa.id }) })
  if (r.ok) ok++
  else console.log(`  falhou ${x.c.id}: ${(await r.text()).slice(0, 120)}`)
}
console.log(`ligados: ${ok} de ${ligar.length}`)
