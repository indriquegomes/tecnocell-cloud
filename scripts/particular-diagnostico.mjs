// SÓ LEITURA — lista o que hoje está lançado no Financeiro e que é conta PESSOAL do dono.
//
// A aba /painel/particular lê `lancamentos` com categoria 'Pró-labore' e 'Particular'
// pelo vencimento do mês. Este script mostra, para um mês, (a) o que já está nessas duas
// categorias — ou seja, o que já aparece na aba — e (b) as linhas que parecem pessoais
// mas estão em categoria de loja (casa, aluguel, escola, condomínio, cartão, saúde…),
// que é o que precisa ser reclassificado para a aba e sair do resultado da loja.
//
// Uso: node scripts/particular-diagnostico.mjs 2026-11
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const P = 1000
async function tudo(f) { const o = []; for (let i = 0; i < 400000; i += P) { const { data, error } = await f(i, i + P - 1); if (error) throw new Error(error.message); if (!data?.length) break; o.push(...data); if (data.length < P) break } return o }
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
const dia = (x) => (x ?? '').slice(0, 10)

const mes = process.argv[2] ?? new Date().toISOString().slice(0, 7)
const [ano, m] = mes.split('-').map(Number)
const de = `${mes}-01`
const ate = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`

// Palavras que denunciam conta da vida do dono dentro de uma linha de loja.
const PESSOAL = /ALUGUEL|CONDOMINIO|ESCOLA|COLEGIO|FACULDADE|CURSO FILHO|IPTU|IPVA|SEGURO (DO )?(CARRO|MOTO|CASA)|FINANCIAMENTO|EMPRESTIMO PESSOAL|CARTAO DE CREDITO|FATURA|PLANO DE SAUDE|DENTISTA|FARMACIA|SUPERMERCADO DA CASA|FEIRA|MERCADO PESSOAL|NETFLIX|SPOTIFY|ACADEMIA|PARCELA DA CASA|REFORMA CASA|MOVEIS/

const linhas = await tudo((from, to) => s.from('lancamentos')
  .select('id, tipo, descricao, valor, valor_pago, status, categoria, subcategoria, data_vencimento, data_pagamento, forma_pagamento, loja_id')
  .eq('tipo', 'pagar')
  .gte('data_vencimento', de).lt('data_vencimento', ate)
  .order('data_vencimento').order('id').range(from, to))

const { data: lojas } = await s.from('lojas').select('id, nome')
const lojaDe = new Map((lojas ?? []).map((l) => [l.id, l.nome]))

const naAba = linhas.filter((l) => ['Pró-labore', 'Particular'].includes(l.categoria ?? ''))
const suspeitas = linhas.filter((l) => !['Pró-labore', 'Particular'].includes(l.categoria ?? '') && PESSOAL.test(norm(l.descricao)))
const retiradas = linhas.filter((l) => l.categoria === 'Retirada do sócio')

console.log(`\n=== ${mes} — PARTICULAR DO DONO ===\n`)
console.log(`Já aparece na aba /painel/particular (categoria Pró-labore/Particular): ${naAba.length} linha(s), R$ ${brl(naAba.reduce((t, l) => t + Number(l.valor ?? 0), 0))}`)
for (const l of naAba) console.log(`  ${dia(l.data_vencimento)}  ${(l.categoria ?? '').padEnd(11)} ${String(l.descricao ?? '').slice(0, 42).padEnd(42)} R$ ${brl(l.valor).padStart(10)}  ${l.status}  ${lojaDe.get(l.loja_id ?? '') ?? '—'}`)

console.log(`\n"Retirada do sócio" (dinheiro que ele tirou da loja — NÃO é conta): ${retiradas.length} linha(s), R$ ${brl(retiradas.reduce((t, l) => t + Number(l.valor ?? 0), 0))}`)
for (const l of retiradas) console.log(`  ${dia(l.data_vencimento)}  ${String(l.descricao ?? '').slice(0, 42).padEnd(42)} R$ ${brl(l.valor).padStart(10)}  ${l.status}`)

console.log(`\nParecem pessoais mas estão em categoria de LOJA (candidatas a virar 'Particular'): ${suspeitas.length}`)
for (const l of suspeitas) console.log(`  ${dia(l.data_vencimento)}  ${String(l.categoria ?? '—').slice(0, 14).padEnd(14)} ${String(l.descricao ?? '').slice(0, 40).padEnd(40)} R$ ${brl(l.valor).padStart(10)}  ${l.status}  ${lojaDe.get(l.loja_id ?? '') ?? '—'}`)
if (!suspeitas.length) console.log('  (nenhuma)')

// Para decidir "é do mês passado?": mostra a mesma varredura nos 3 meses anteriores.
console.log('\n--- Mesma varredura nos meses anteriores (para ver se algo é de mês passado) ---')
for (const ant of [-1, -2, -3]) {
  const d = new Date(ano, m - 1 + ant, 1)
  const a = d.getFullYear()
  const mm = d.getMonth() + 1
  const ini = `${a}-${String(mm).padStart(2, '0')}-01`
  const fim = mm === 12 ? `${a + 1}-01-01` : `${a}-${String(mm + 1).padStart(2, '0')}-01`
  const ls = await tudo((from, to) => s.from('lancamentos')
    .select('id, descricao, valor, status, categoria, data_vencimento')
    .eq('tipo', 'pagar').gte('data_vencimento', ini).lt('data_vencimento', fim)
    .order('data_vencimento').range(from, to))
  const p = ls.filter((l) => ['Pró-labore', 'Particular'].includes(l.categoria ?? ''))
  const sp = ls.filter((l) => !['Pró-labore', 'Particular'].includes(l.categoria ?? '') && PESSOAL.test(norm(l.descricao)))
  console.log(`  ${ini.slice(0, 7)}: aba ${p.length} (R$ ${brl(p.reduce((t, l) => t + Number(l.valor ?? 0), 0))}) · suspeitas ${sp.length}${sp.length ? ' → ' + sp.map((l) => `${l.descricao} R$ ${brl(l.valor)}`).join(' | ').slice(0, 200) : ''}`)
}
console.log('')
