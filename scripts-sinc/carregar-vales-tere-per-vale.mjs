// carregar-vales-tere-per-vale.mjs — importa os vales de TERESÓPOLIS como LINHAS
// individuais (1 linha por vale), com loja_id. Fonte: scripts-sinc/data/vales-teresopolis.json
// (export SIGE "VALES DE CLIENTES" de Teresópolis: codigo + nome + valor).
//
// Vínculo: a fonte só tem NOME (sem id SIGE/CPF). Casa por nome ÚNICO contra pessoas
// (normalizado, sem acento). Homônimo (2+ pessoas) ou sem match ficam FLAGADOS pra
// revisão manual — nunca chuta. Para vínculo por id/CPF (regra estrita), passar a
// lista de clientes de Teresópolis (id+cpf+nome) — ver header de carregar-vales-tere.mjs.
//
// Idempotente: id determinístico (uuid v5 do código do vale). Re-rodar não duplica.
// Modos:
//   (padrão) dry-run: relatório, grava NADA.
//   --gravar: backup + grava 1 linha por vale.
//   --rollback <backup.json>: restaura.
//
// Uso:
//   node scripts-sinc/carregar-vales-tere-per-vale.mjs
//   node scripts-sinc/carregar-vales-tere-per-vale.mjs --gravar

import { readFile, writeFile } from 'node:fs/promises'
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

const argv = process.argv.slice(2)
const FLAGS = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) { const k = a.slice(2); const next = argv[i + 1]; if (next && !next.startsWith('--')) { FLAGS[k] = next; i++ } else FLAGS[k] = true }
}
const GRAVAR = FLAGS.gravar === true || FLAGS.gravar === 'true'
const ROLLBACK = typeof FLAGS.rollback === 'string' ? FLAGS.rollback : null
const ARQ = 'scripts-sinc/data/vales-teresopolis.json'

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// uuid v5 determinístico por CÓDIGO do vale (namespace próprio de Teresópolis linha,
// separado do baseline 'tecnocell:vale:tere:' e do Petrópolis 'tecnocell:valexlsx:').
export const uuidValeLinha = (seed) => {
  const h = createHash('sha1').update('tecnocell:valexlsx:tere:' + seed).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.toString('hex')
  return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20, 32)
}

export const resolveCliente = (nome, porNomeNorm) => {
  const alvos = porNomeNorm.get(norm(nome)) || []
  if (alvos.length === 1) return { status: 'ok', pessoaId: alvos[0].id }
  if (alvos.length > 1) return { status: 'dup', pessoaId: null }
  return { status: 'sem', pessoaId: null }
}

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
    method: 'POST', headers: { ...H, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(linhas),
  })
  if (!r.ok) throw new Error('HTTP ' + r.status + ' no upsert de ' + linhas.length + ' linhas')
}
async function deletar(ids) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const r = await fetch(SUPABASE_URL + '/rest/v1/creditos_clientes?id=in.(' + chunk.map(encodeURIComponent).join(',') + ')', { method: 'DELETE', headers: H })
    if (!r.ok) throw new Error('HTTP ' + r.status + ' no delete de ' + chunk.length)
  }
}
const fmt = (n) => 'R$ ' + Number(n || 0).toFixed(2)

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local).'); process.exit(1) }

  if (ROLLBACK) {
    if (!existsSync(ROLLBACK)) { console.error('Backup não encontrado: ' + ROLLBACK); process.exit(1) }
    const bkp = JSON.parse(await readFile(ROLLBACK, 'utf8'))
    const restaurar = [], apagar = []
    for (const p of (bkp.pares ?? [])) { if (p.anterior) restaurar.push(p.anterior); else apagar.push(p.id) }
    if (restaurar.length) await upsert(restaurar)
    if (apagar.length) await deletar(apagar)
    console.log('ROLLBACK ok: ' + restaurar.length + ' restauradas, ' + apagar.length + ' removidas.')
    return
  }

  if (!existsSync(ARQ)) { console.error('Falta ' + ARQ + '.'); process.exit(1) }
  const vales = JSON.parse(await readFile(ARQ, 'utf8'))

  // loja Teresópolis
  const lojas = await restTodos('lojas?select=id,nome')
  const lojasTere = lojas.filter((l) => (l.nome ?? '').toLowerCase().includes('teres'))
  if (lojasTere.length !== 1) { console.error('Esperava 1 loja "Teresópolis"; achei ' + lojasTere.length + '.'); process.exit(1) }
  const LOJA_ID = lojasTere[0].id
  console.log('Loja destino: ' + lojasTere[0].nome + ' (' + LOJA_ID + ')')

  // pessoas + mapa por nome normalizado
  const pessoas = await restTodos('pessoas?select=id,cpf_cnpj,nome')
  const porNomeNorm = new Map()
  for (const p of pessoas) {
    const k = norm(p.nome)
    if (!k) continue
    if (!porNomeNorm.has(k)) porNomeNorm.set(k, [])
    porNomeNorm.get(k).push(p)
  }

  // linhas já importadas (id determinístico)
  const creditos = await restTodos('creditos_clientes?select=id,pessoa_id,pessoa_nome,valor,tipo,descricao,loja_id,created_at')
  const porIdLinha = new Map()
  for (const l of creditos) if (l.id) porIdLinha.set(l.id, l)

  const res = { ok: 0, novo: 0, dup: 0, sem: 0 }
  let soma = 0
  const conflitos = []
  const aGravar = []
  const pares = []

  for (const v of vales) {
    const valor = Math.round((Number(v.valor) || 0) * 100) / 100
    if (valor <= 0) continue
    soma += valor
    const r = resolveCliente(v.nome, porNomeNorm)
    if (r.status === 'sem') { res.sem++; conflitos.push({ codigo: v.codigo, nome: v.nome, motivo: 'sem_match' }); continue }
    if (r.status === 'dup') { res.dup++; conflitos.push({ codigo: v.codigo, nome: v.nome, motivo: 'homônimo' }); continue }

    const id = uuidValeLinha(String(v.codigo))
    const anterior = porIdLinha.get(id) ?? null
    const atual = Number(anterior?.valor) || 0
    if (Math.abs(atual - valor) < 0.005 && (anterior?.loja_id ?? null) === LOJA_ID) { res.ok++; continue }

    res.novo++
    aGravar.push({
      id,
      pessoa_id: r.pessoaId,
      pessoa_nome: String(v.nome ?? '').trim(),
      valor,
      tipo: 'credito',
      descricao: 'Vale SIGE Teresópolis #' + v.codigo,
      loja_id: LOJA_ID,
      created_at: new Date().toISOString(),
    })
    pares.push({ id, anterior: anterior ? { id: anterior.id, pessoa_id: anterior.pessoa_id, pessoa_nome: anterior.pessoa_nome ?? '', valor: anterior.valor, tipo: anterior.tipo, descricao: anterior.descricao, loja_id: anterior.loja_id ?? null, created_at: anterior.created_at } : null })
  }

  console.log('=== RELATÓRIO VALES TERESÓPOLIS (' + (GRAVAR ? 'GRAVAÇÃO' : 'DRY-RUN') + ') ===')
  console.log('Vales no arquivo: ' + vales.length + ' | Total: ' + fmt(soma))
  console.log('  já importados (batem): ' + res.ok)
  console.log('  a importar: ' + res.novo)
  console.log('  homônimo (nome 2+): ' + res.dup)
  console.log('  sem match: ' + res.sem)
  if (conflitos.length) {
    console.log('\n--- Conflitos (revisar manual) ---')
    for (const c of conflitos) console.log('  [' + c.motivo + '] #' + c.codigo + ' ' + c.nome)
  }

  if (!GRAVAR) { console.log('\n=== NADA GRAVADO (dry-run). --gravar após aprovar. ==='); return }
  if (aGravar.length === 0) { console.log('\nNada a importar.'); return }

  const bkp = { loja: lojasTere[0].nome, fonte: ARQ, pares }
  const bkpArq = 'backup-vales-tere-per-vale-' + new Date().toISOString().slice(0, 10) + '.json'
  await writeFile(bkpArq, JSON.stringify(bkp, null, 2), 'utf8')
  console.log('\nBackup salvo: ' + bkpArq)
  await upsert(aGravar)
  console.log('Gravados: ' + aGravar.length)
  console.log('Rollback: node scripts-sinc/carregar-vales-tere-per-vale.mjs --rollback ' + bkpArq)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('ERRO: ' + e.message); process.exit(1) })
}
