// LANÇA (escreve) os pagamentos dos fornecedores de fora da lista — outubro/2026.
// Autorizado pelo dono em 26/10/2026. Troca Acessórios fica de fora (por decisão do dono).
// Backup antes, idempotente, e gera o SQL de desfazer.
// Uso: node scripts/lancar-fornecedores-fora.mjs --gravar
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GRAVAR = process.argv.includes('--gravar')
const brl = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function pagina(tabela, colunas, aplicar, ordem = 'id') {
  const o = []
  for (let p = 0; ; p++) {
    let q = s.from(tabela).select(colunas)
    if (aplicar) q = aplicar(q)
    const { data, error } = await q.order(ordem).range(p * 1000, p * 1000 + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data.length) break
    o.push(...data)
    if (data.length < 1000) break
  }
  return o
}

const FORA_DA_LISTA = ['6a57bd81944a25f33f1b46a0', '64a962b59d3ac1a8f1953ced', '6a184c444f535f99fecfec07', '642ac3d6777d683f5ff08561']
const EXCLUIR = '6a1f0c110a2104f2ab8579e3' // TROCA ACESSORIOS — decisão do dono: fica fora

const pessoas = await pagina('pessoas', 'id, nome, tipo')
const nomeDe = new Map(pessoas.map((p) => [p.id, p.nome]))

const notas = await pagina('notas_entrada', 'id, numero, fornecedor_id, valor_total, data_entrada, status', (q) => q.gte('data_entrada', '2026-10-01').lt('data_entrada', '2026-11-01'), 'data_entrada')
const alvo = notas
  .filter((n) => FORA_DA_LISTA.includes(n.fornecedor_id) && Number(n.valor_total) > 0 && n.status === 'recebida')
  .sort((a, b) => a.data_entrada.localeCompare(b.data_entrada))

console.log(`Notas a lançar: ${alvo.length} · ${brl(alvo.reduce((t, n) => t + Number(n.valor_total), 0))}`)
for (const n of alvo) console.log(`  ${n.data_entrada} nº ${String(n.numero).padStart(4)} ${brl(n.valor_total).padStart(11)} ${nomeDe.get(n.fornecedor_id)}`)

const existentes = await pagina('lancamentos', 'id, descricao', (q) => q.ilike('descricao', 'CONF FECHAMENTO OUT/2026%'))
const jaTem = new Set(existentes.map((l) => l.descricao))
const linhas = alvo
  .map((n) => ({
    tipo: 'pagar',
    status: 'pago',
    valor: Number(n.valor_total),
    valor_pago: Number(n.valor_total),
    data_competencia: n.data_entrada,
    data_vencimento: n.data_entrada,
    data_pagamento: n.data_entrada + 'T12:00:00-03:00',
    forma_pagamento: 'Dinheiro',
    categoria: 'Fornecedor / Mercadoria',
    pessoa_id: n.fornecedor_id,
    pessoa_nome: nomeDe.get(n.fornecedor_id) ?? null,
    descricao: `CONF FECHAMENTO OUT/2026 — nota de entrada nº ${n.numero}`,
  }))
  .filter((l) => !jaTem.has(l.descricao))

console.log(`\nA lançar agora: ${linhas.length} · ${brl(linhas.reduce((t, l) => t + l.valor, 0))}`)
console.log(`Já existentes (não relança): ${alvo.length - linhas.length}`)

if (!GRAVAR) {
  console.log('\n(DRY-RUN — nada gravado. Rode com --gravar para escrever.)')
  process.exit(0)
}
if (!linhas.length) { console.log('\nNada a fazer.'); process.exit(0) }

// ── backup antes ────────────────────────────────────────────────────
const dir = 'docs/registros-banco/2026-10'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
const antes = await pagina('lancamentos', 'id, valor, descricao')
const backup = {
  quando: new Date().toISOString(),
  motivo: 'Lançamento dos pagamentos de fornecedores fora da lista (autorizado pelo dono 26/10)',
  total_lancamentos_antes: antes.length,
  soma_antes: antes.reduce((t, l) => t + Number(l.valor ?? 0), 0),
  notas_usadas: alvo.map((n) => ({ nota: n.numero, fornecedor: nomeDe.get(n.fornecedor_id), valor: n.valor_total, data: n.data_entrada })),
  linhas_a_criar: linhas,
}
const arqBackup = `${dir}/lancamento-fornecedores-fora-${carimbo}.json`
fs.writeFileSync(arqBackup, JSON.stringify(backup, null, 2), 'utf8')
console.log(`\nbackup salvo: ${arqBackup}`)

// ── grava ──────────────────────────────────────────────────────────
const { data, error } = await s.from('lancamentos').insert(linhas).select('id, descricao, valor, pessoa_nome')
if (error) { console.error('ERRO ao gravar:', error.message); process.exit(1) }
console.log(`\n✅ ${data.length} lançamentos criados · ${brl(data.reduce((t, l) => t + Number(l.valor), 0))}`)

// ── desfazer ───────────────────────────────────────────────────────
const ids = data.map((l) => `'${l.id}'`).join(',\n  ')
const sql = `-- DESFAZER o lançamento dos fornecedores fora da lista (outubro/2026)\n-- criado em ${new Date().toISOString()} · ${data.length} linhas · ${brl(data.reduce((t, l) => t + Number(l.valor), 0))}\nDELETE FROM lancamentos\nWHERE id IN (\n  ${ids}\n);\n`
fs.writeFileSync(`${dir}/DESFAZER-fornecedores-fora-${carimbo}.sql`, sql, 'utf8')
console.log(`desfazer salvo: ${dir}/DESFAZER-fornecedores-fora-${carimbo}.sql`)

// ── confere depois ─────────────────────────────────────────────────
const depois = await pagina('lancamentos', 'id, valor')
console.log(`\nlançamentos no banco: antes ${antes.length} → depois ${depois.length}`)
console.log(`soma de valores: antes ${brl(backup.soma_antes)} → depois ${brl(depois.reduce((t, l) => t + Number(l.valor ?? 0), 0))}`)
