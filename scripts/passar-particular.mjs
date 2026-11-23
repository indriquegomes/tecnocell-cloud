// RECLASSIFICA: move as contas pessoais que já estavam lançadas no Financeiro para a
// categoria 'Particular' — assim elas aparecem na aba /painel/particular e saem da lista
// "Retirada do sócio", que é dinheiro sacado, não conta paga.
//
// É só rótulo: nenhum valor, data, forma, conta ou comprovante muda. O dinheiro continua
// no mesmo lançamento e a despesa do mês continua igual — muda onde a linha é lida.
//
// DRY por padrão; grava só com `--gravar`. Sempre gera backup JSON + DESFAZER.sql.
//
// Uso: node scripts/passar-particular.mjs [--gravar]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GRAVAR = process.argv.includes('--gravar')
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── OPERAÇÃO — conta pessoal que já está lançada ───────────────────────────
// id            lançamento a reclassificar
// subcategoria  o que é a conta (opções em SUBCATEGORIAS['Particular'])
const OPERACOES = [
  { id: 'cbdfef0c-8614-4a65-af93-03fdf0432ca1', subcategoria: 'Pessoal' }, // 1.499,78 · pagamento de conta p/ Luiza Lopes Neves
  { id: '259ea06a-18b0-4660-b372-4ece6e50491b', subcategoria: 'Pessoal' }, // 500,00 · retirada p/ Leoni De Souza Azevedo
  { id: '8f20d458-6a70-4d8c-910a-dbfd4a3dd1fa', subcategoria: 'Casa' },    // 96,69 · Supercabo TV (internet da casa)
]

// ─── nada abaixo precisa mexer ──────────────────────────────────────────────
const ids = OPERACOES.map((o) => o.id)
const { data: antes, error: e1 } = await s.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, categoria, subcategoria, data_vencimento, data_pagamento, forma_pagamento, conta_id, loja_id, pessoa_nome')
  .in('id', ids)
if (e1) throw new Error(e1.message)
if ((antes ?? []).length !== ids.length) {
  console.error(`esperava ${ids.length} lançamento(s), achei ${(antes ?? []).length}`)
  process.exit(1)
}

console.log('\nANTES')
for (const o of OPERACOES) {
  const l = antes.find((x) => x.id === o.id)
  console.log(`  ${(l.data_vencimento ?? '').slice(0, 10)}  R$ ${brl(l.valor).padStart(9)}  ${String(l.categoria).padEnd(18)} → Particular / ${o.subcategoria}`)
  console.log(`      ${l.descricao}`)
  console.log(`      ${l.status} · ${l.forma_pagamento} · conta ${(l.conta_id ?? '—').slice(0, 8)} · ${l.pessoa_nome}`)
  if (l.categoria === 'Particular') console.log('      (já está em Particular — não mexe)')
}

const total = antes.reduce((t, l) => t + Number(l.valor ?? 0), 0)
console.log(`\nTotal que passa para a aba Particular: R$ ${brl(total)}`)

if (!GRAVAR) {
  console.log('\n(DRY-RUN — nada gravado. Use --gravar depois do ok do dono.)')
  process.exit(0)
}

const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/particular-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), antes }, null, 2), 'utf8')

for (const o of OPERACOES) {
  const { error } = await s.from('lancamentos')
    .update({ categoria: 'Particular', subcategoria: o.subcategoria, updated_at: new Date().toISOString() })
    .eq('id', o.id)
  if (error) { console.error('erro ao gravar', o.id, error.message); process.exit(1) }
}

const desfazer = antes.map((l) =>
  `UPDATE lancamentos SET categoria = ${l.categoria ? `'${l.categoria.replace(/'/g, "''")}'` : 'NULL'}, subcategoria = ${l.subcategoria ? `'${l.subcategoria.replace(/'/g, "''")}'` : 'NULL'}, updated_at = now() WHERE id = '${l.id}';`,
).join('\n') + '\n'
fs.writeFileSync(`${dir}/DESFAZER-particular-${carimbo}.sql`, desfazer, 'utf8')

const { data: depois } = await s.from('lancamentos')
  .select('id, descricao, valor, categoria, subcategoria').in('id', ids)
console.log('\nDEPOIS')
for (const l of depois ?? []) console.log(`  R$ ${brl(l.valor).padStart(9)}  ${l.categoria} / ${l.subcategoria}  — ${String(l.descricao ?? '').slice(0, 60)}`)
console.log(`\nbackup: ${dir}/particular-antes-${carimbo}.json`)
console.log(`desfazer: ${dir}/DESFAZER-particular-${carimbo}.sql`)
