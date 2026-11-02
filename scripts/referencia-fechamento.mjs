// READ-ONLY. Gera a referência do app pra você conferir as planilhas de fora:
// nome dos fornecedores do jeito que estão cadastrados, depósitos por loja,
// categorias de despesa que já existem e os caixas que ficaram ABERTOS.
//
// Uso:  node scripts/referencia-fechamento.mjs 2026-10
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PAGINA = 1000
async function tudo(fazer) {
  const out = []
  for (let from = 0; from < 500000; from += PAGINA) {
    const { data, error } = await fazer(from, from + PAGINA - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGINA) break
  }
  return out
}

const mes = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
const [ano, m] = mes.split('-').map(Number)
const de = mes + '-01'
const ate = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`

const [{ data: lojas }, depositos, fornecedores, caixas, categorias] = await Promise.all([
  s.from('lojas').select('id, nome').order('nome'),
  tudo((from, to) => s.from('depositos').select('id, nome, loja_id').range(from, to)),
  tudo((from, to) => s.from('pessoas').select('id, nome, tipo').in('tipo', ['fornecedor', 'ambos']).order('nome').range(from, to)),
  tudo((from, to) => s.from('caixas').select('id, loja_id, aberto_em, fechado_em, valor_abertura, status')
    .gte('aberto_em', de + 'T00:00:00-03:00').lt('aberto_em', ate + 'T00:00:00-03:00').order('aberto_em').range(from, to)),
  tudo((from, to) => s.from('lancamentos').select('categoria, tipo')
    .gte('created_at', '2026-01-01T00:00:00-03:00').range(from, to)),
])
const nomeLoja = (id) => lojas?.find((l) => l.id === id)?.nome ?? '(sem loja)'

const cats = new Set(categorias.map((c) => (c.tipo ?? '') + ' | ' + (c.categoria ?? '(sem categoria)')))
const abertos = caixas.filter((c) => c.status === 'aberto')

const linhas = []
linhas.push(`# Referência do app — ${mes}`, '')
linhas.push('> Somente leitura. Gerado por `scripts/referencia-fechamento.mjs`.', '')

linhas.push('## Depósitos por loja', '')
for (const l of lojas ?? []) {
  const deps = depositos.filter((d) => d.loja_id === l.id)
  linhas.push(`- **${l.nome}**: ${deps.map((d) => d.nome).join(' · ') || '(nenhum)'}`)
}
linhas.push('')

linhas.push(`## Fornecedores cadastrados (${fornecedores.length})`, '')
linhas.push('Use estes nomes na planilha quando der — nome diferente vira divergência.', '')
for (const f of fornecedores) linhas.push(`- ${f.nome}${f.tipo === 'ambos' ? ' _(cliente e fornecedor)_' : ''}`)
linhas.push('')

linhas.push('## Categorias de despesa já usadas no app', '')
for (const c of [...cats].sort()) linhas.push(`- ${c}`)
linhas.push('')

linhas.push(`## Caixas de ${mes} (${caixas.length}) — ${abertos.length} ainda ABERTOS`, '')
for (const c of caixas) {
  const ab = new Date(c.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const fe = c.fechado_em ? new Date(c.fechado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
  linhas.push(`- ${nomeLoja(c.loja_id)} · abriu ${ab} · fechou ${fe} · abertura R$ ${Number(c.valor_abertura ?? 0).toFixed(2)} · ${c.status}`)
}
linhas.push('')

const dir = path.join('docs', 'fechamento', mes)
fs.mkdirSync(dir, { recursive: true })
const arquivo = path.join(dir, 'referencia.md')
fs.writeFileSync(arquivo, linhas.join('\n'), 'utf8')
console.log(`ok: ${arquivo}`)
console.log(`fornecedores ${fornecedores.length} · caixas ${caixas.length} · caixas abertos ${abertos.length}`)
