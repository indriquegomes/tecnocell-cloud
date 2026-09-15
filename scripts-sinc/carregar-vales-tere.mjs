// carregar-vales-tere.mjs — importa saldo de vale do SIGE (TERESÓPOLIS) como
// baseline auditável e idempotente. NÃO mistura com a migration do vale-fiado.
//
// Fonte: Vales-Teresopolis-*.json (puxa-vale.mjs) => { id (ObjectId SIGE), nome,
// cpfCnpj, saldoValeCredito }. É SALDO ATUAL por cliente — NÃO há histórico de
// movimentos nessa fonte. Portanto: 1 linha de baseline por cliente (uuid v5),
// descricao "Vale SIGE <loja> — saldo em <corte>". Nunca recria histórico antigo.
//
// Vínculo: id SIGE (pessoas.id é o ObjectId 1:1) → CPF/CNPJ único → NUNCA por nome.
//
// Modos:
//   (padrão) dry-run: compara SIGE × banco e imprime relatório, grava NADA.
//   --gravar       : faz backup (linhas de baseline atuais) e aplica o delta.
//   --rollback f   : restaura o estado anterior a partir do backup.
//
// Idempotente (on conflict id). NUNCA apaga nada, exceto no rollback explícito.
//
// Uso:
//   node scripts-sinc/carregar-vales-tere.mjs Vales-Teresopolis-2026-09-11.json
//   node scripts-sinc/carregar-vales-tere.mjs Vales-Teresopolis-2026-09-11.json --loja Teresópolis --corte 2026-09-11
//   node scripts-sinc/carregar-vales-tere.mjs Vales-Teresopolis-2026-09-11.json --gravar --loja Teresópolis --corte 2026-09-11
//   node scripts-sinc/carregar-vales-tere.mjs --rollback backup-vales-tere-2026-09-11.json

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

function envLocal() {
  try {
    const out = {}
    const txt = readFileSync('.env.local', 'utf8').replace(/^\ufeff/, '')
    for (const linha of txt.split('\n')) {
      const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2].trim()
    }
    return out
  } catch { return {} }
}
const env = envLocal()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY }

// ---- flags/args ----
const argv = process.argv.slice(2)
const FLAGS = {}
const POS = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { FLAGS[k] = next; i++ }
    else FLAGS[k] = true
  } else {
    POS.push(a)
  }
}
const GRAVAR = FLAGS.gravar === true || FLAGS.gravar === 'true'
const ROLLBACK = typeof FLAGS.rollback === 'string' ? FLAGS.rollback : null
const LOJA = typeof FLAGS.loja === 'string' ? FLAGS.loja : 'Teresópolis'
const CORTE = typeof FLAGS.corte === 'string' ? FLAGS.corte : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

// ---- helpers puros (exportados pra teste) ----
export const dig = (s) => String(s ?? '').replace(/\D/g, '')

// uuid v5 determinístico, namespace PRÓPRIO do vale de Teresópolis (não colide com
// a baseline de Petrópolis, que usa 'tecnocell:vale:').
export const uuidValeTere = (seed) => {
  const h = createHash('sha1').update('tecnocell:vale:tere:' + seed).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.toString('hex')
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20, 32)
}

// Resolve a pessoa do TecnoCell pra um cliente SIGE. Ordem: id → CPF/CNPJ único.
// Retorna { status: 'ok'|'dup'|'sem', pessoaId: string|null }.
export const resolvePessoa = (vale, porId, porCpf) => {
  const id = vale.id ? String(vale.id) : null
  if (id && porId.has(id)) return { status: 'ok', pessoaId: id }
  const cpf = dig(vale.cpfCnpj)
  if (cpf) {
    const alvos = porCpf.get(cpf) || []
    if (alvos.length === 1) return { status: 'ok', pessoaId: alvos[0].id }
    if (alvos.length > 1) return { status: 'dup', pessoaId: null }
  }
  return { status: 'sem', pessoaId: null }
}

const pega = (o, ...ks) => { for (const k of ks) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null }
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.')); return Number.isFinite(n) ? n : null }
const saldoSige = (c) => Math.round((num(pega(c, 'SaldoValeCredito', 'saldoValeCredito')) ?? 0) * 100) / 100

async function rest(path) { const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: H }); if (!r.ok) throw new Error('HTTP ' + r.status + ' em ' + path); return r.json() }
async function restTodos(path) {
  const out = []
  for (let off = 0;; off += 1000) {
    const lote = await rest(path + (path.includes('?') ? '&' : '?') + 'limit=1000&offset=' + off)
    out.push(...lote)
    if (lote.length < 1000) return out
  }
}

async function upsert(linhas) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/creditos_clientes?on_conflict=id', {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(linhas),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' no upsert de ' + linhas.length + ' linhas')
}

async function deletar(ids) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const r = await fetch(SUPABASE_URL + '/rest/v1/creditos_clientes?id=in.(' + chunk.map(encodeURIComponent).join(',') + ')', { method: 'DELETE', headers: H })
    if (!r.ok) throw new Error('HTTP ' + r.status + ' no delete de ' + chunk.length + ' ids')
  }
}

const fmt = (n) => 'R$ ' + Number(n || 0).toFixed(2)

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (.env.local).'); process.exit(1) }

  // ---- rollback ----
  if (ROLLBACK) {
    if (!existsSync(ROLLBACK)) { console.error('Backup não encontrado: ' + ROLLBACK); process.exit(1) }
    const bkp = JSON.parse(await readFile(ROLLBACK, 'utf8'))
    const restaurar = [], apagar = []
    for (const p of (bkp.pares ?? [])) {
      if (p.anterior) restaurar.push(p.anterior)
      else apagar.push(p.id)
    }
    if (restaurar.length) await upsert(restaurar)
    if (apagar.length) await deletar(apagar)
    console.log('ROLLBACK ok: ' + restaurar.length + ' restauradas, ' + apagar.length + ' removidas.')
    return
  }

  // ---- entrada ----
  let arq = POS[0]
  if (!arq) { const fs = (await readdir('.')).filter((f) => /^Vales-Teresopolis-.*\.json$/i.test(f)).sort(); arq = fs[fs.length - 1] }
  if (!arq || !existsSync(arq)) { console.error('Nenhum Vales-Teresopolis-*.json. Rode puxa-vale.mjs com o token de TERESÓPOLIS antes (ou passe o arquivo). NÃO aceito o Vales-*.json de Petrópolis por padrão.'); process.exit(1) }
  if (!/teresopolis/i.test(arq)) { console.error('Importador de TERESÓPOLIS: o arquivo ' + arq + ' não é Vales-Teresopolis-*. Provável arquivo de Petrópolis — abortando.'); process.exit(1) }
  const vales = JSON.parse(await readFile(arq, 'utf8'))
  if (!Array.isArray(vales)) { console.error(arq + ': não é um array.'); process.exit(1) }

  // ---- pessoas (id + cpf_cnpj) ----
  const pessoas = await restTodos('pessoas?select=id,cpf_cnpj,nome')
  const porId = new Set()
  const porCpf = new Map()
  for (const p of pessoas) {
    if (p.id) porId.add(p.id)
    const c = dig(p.cpf_cnpj)
    if (c) { if (!porCpf.has(c)) porCpf.set(c, []); porCpf.get(c).push(p) }
  }

  // ---- loja destino (Teresópolis) ----
  const lojas = await restTodos('lojas?select=id,nome')
  const lojasAlvo = lojas.filter((l) => (l.nome ?? '').toLowerCase().includes('teres'))
  if (lojasAlvo.length !== 1) { console.error('Esperava 1 loja "Teresópolis" em lojas; achei ' + lojasAlvo.length + '. Abortando.'); process.exit(1) }
  const LOJA_ID = lojasAlvo[0].id
  console.log('Loja destino: ' + lojasAlvo[0].nome + ' (' + LOJA_ID + ')')

  // ---- baseline existente (todas as linhas, filtra em JS por id) ----
  const creditos = await restTodos('creditos_clientes?select=id,pessoa_id,pessoa_nome,valor,tipo,descricao,loja_id,created_at')
  const porIdLinha = new Map()
  for (const l of creditos) if (l.id) porIdLinha.set(l.id, l)

  // ---- classificação ----
  const res = { ok: 0, importar: 0, dup: 0, sem: 0, zero: 0 }
  let somaSige = 0
  const deltas = []
  const conflitos = []
  const aGravar = []
  const pares = []

  for (const v of vales) {
    const sige = saldoSige(v)
    if (sige <= 0) { res.zero++; continue }
    somaSige += sige
    const r = resolvePessoa(v, porId, porCpf)
    if (r.status === 'sem') { res.sem++; conflitos.push({ motivo: 'sem_match', nome: v.nome ?? '', id: v.id ?? '', cpf: dig(v.cpfCnpj) }); continue }
    if (r.status === 'dup') { res.dup++; conflitos.push({ motivo: 'cpf_duplicado', nome: v.nome ?? '', id: v.id ?? '', cpf: dig(v.cpfCnpj) }); continue }

    const baselineId = uuidValeTere(r.pessoaId)
    const anterior = porIdLinha.get(baselineId) ?? null
    const atual = Number(anterior?.valor) || 0
    const delta = Math.round((sige - atual) * 100) / 100

    if (Math.abs(delta) < 0.005) { res.ok++; continue }

    res.importar++
    deltas.push(delta)
    aGravar.push({
      id: baselineId,
      pessoa_id: r.pessoaId,
      pessoa_nome: String(v.nome ?? '').trim() || 'Cliente SIGE',
      valor: sige,
      tipo: 'credito',
      descricao: 'Vale SIGE ' + LOJA + ' — saldo em ' + CORTE,
      loja_id: LOJA_ID,
      created_at: new Date().toISOString(),
    })
    pares.push({
      id: baselineId,
      anterior: anterior ? {
        id: anterior.id, pessoa_id: anterior.pessoa_id, pessoa_nome: anterior.pessoa_nome ?? '',
        valor: anterior.valor, tipo: anterior.tipo, descricao: anterior.descricao, loja_id: anterior.loja_id ?? null, created_at: anterior.created_at,
      } : null,
    })
  }

  const deltaLiquido = Math.round(deltas.reduce((s, d) => s + d, 0) * 100) / 100
  const somaSigeTotal = Math.round(somaSige * 100) / 100

  // ---- relatório ----
  console.log('=== RELATÓRIO VALE SIGE (' + (GRAVAR ? 'GRAVAÇÃO' : 'DRY-RUN') + ') ===')
  console.log('Fonte: ' + arq + ' (' + vales.length + ' clientes SIGE com vale)')
  console.log('Loja: ' + LOJA + ' | Corte: ' + CORTE)
  console.log('pessoas no TecnoCell: ' + pessoas.length)
  console.log('')
  console.log('Clientes SIGE com vale: ' + vales.length)
  console.log('Saldo total SIGE: ' + fmt(somaSigeTotal))
  console.log('  já importados (batem): ' + res.ok)
  console.log('  a importar (delta):    ' + res.importar + ' — ' + fmt(deltaLiquido) + ' líquido')
  console.log('  duplicados (cpf 2+):   ' + res.dup)
  console.log('  não encontrados:       ' + res.sem)
  console.log('  saldo zero:            ' + res.zero)
  console.log('Conflitos (dup + sem):   ' + (res.dup + res.sem))
  if (conflitos.length) {
    console.log('\n--- Conflitos (revisar manualmente) ---')
    for (const c of conflitos.slice(0, 50)) console.log('  [' + c.motivo + '] ' + c.nome + ' | id=' + c.id + ' | cpf=' + c.cpf)
    if (conflitos.length > 50) console.log('  ... +' + (conflitos.length - 50) + ' (ver arquivo)')
  }

  if (!GRAVAR) {
    console.log('\n=== NADA GRAVADO (dry-run). Rode com --gravar após aprovar. ===')
    return
  }

  if (aGravar.length === 0) { console.log('\nNada a importar.'); return }

  const bkp = { loja: LOJA, corte: CORTE, fonte: arq, pares }
  const bkpArq = 'backup-vales-tere-' + CORTE + '.json'
  await writeFile(bkpArq, JSON.stringify(bkp, null, 2), 'utf8')
  console.log('\nBackup salvo: ' + bkpArq)

  await upsert(aGravar)
  console.log('Gravados: ' + aGravar.length + ' (idempotente, baseline por cliente)')
  console.log('Rollback: node scripts-sinc/carregar-vales-tere.mjs --rollback ' + bkpArq)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
}
