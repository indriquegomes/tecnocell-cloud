// Verificação da baixa de pagamento em nota (lib/abater-divida.ts) — ESCREVE E APAGA.
//
// Cria uma nota de teste e um recebedor com prefixo __QA__, roda dois casos e apaga tudo
// no fim (inclusive quando falha). Serve para provar, depois de qualquer mexida na
// função, que: (1) pagamento parcial encolhe a nota e deixa o resto pendente;
// (2) pagamento maior que a dívida zera a nota e gera crédito negativo para a próxima.
//
// Uso: node --import ./test/alias.mjs scripts/teste-baixa-em-nota.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { abaterNaDivida } from '../lib/abater-divida.ts'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const NOME = '__QA__ FORNECEDOR BAIXA'
const LOJA = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946'
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const criados = []

async function limpar() {
  if (!criados.length) return
  await s.from('lancamentos').delete().in('id', criados)
  await s.from('pessoas').delete().eq('nome', NOME)
}

try {
  // nota de 1.000 pendente
  const notaId = crypto.randomUUID()
  await s.from('lancamentos').insert({
    id: notaId, descricao: 'COMPRA MERCADORIA - NOTA QATEST', valor: 1000, tipo: 'pagar',
    categoria: 'Mercadoria', pessoa_nome: NOME, loja_id: LOJA, status: 'pendente', valor_pago: 0,
    data_competencia: hoje, data_vencimento: hoje, updated_at: new Date().toISOString(),
  })
  criados.push(notaId)

  // CASO 1 — pagou 300 de uma nota de 1.000
  const r1 = await abaterNaDivida(s, NOME, LOJA, 300, 'Crédito de pagamento — QA', 'pagamento')
  const { data: n1 } = await s.from('lancamentos').select('valor, status, descricao').eq('id', notaId).single()
  console.log('CASO 1 (paga 300 de 1.000)')
  console.log('  ok:', r1.ok, '| crédito:', r1.credito)
  console.log('  nota agora:', n1?.valor, '| status:', n1?.status)
  console.log('  descrição:', n1?.descricao)
  const caso1Ok = r1.ok && Number(n1?.valor) === 700 && n1?.status === 'pendente' && /abateu 300,00 de pagamento/.test(n1?.descricao ?? '')

  // CASO 2 — paga 900, sobra 200 de crédito
  const r2 = await abaterNaDivida(s, NOME, LOJA, 900, 'Crédito de pagamento — QA', 'pagamento')
  const { data: n2 } = await s.from('lancamentos').select('valor, status').eq('id', notaId).single()
  const { data: cred } = await s.from('lancamentos').select('id, valor, descricao').eq('pessoa_nome', NOME).lt('valor', 0)
  for (const c of cred ?? []) criados.push(c.id)
  console.log('\nCASO 2 (paga 900, devia 700)')
  console.log('  ok:', r2.ok, '| crédito:', r2.credito)
  console.log('  nota:', n2?.valor, '| status:', n2?.status)
  console.log('  linha de crédito:', (cred ?? []).map((c) => `${c.valor} (${c.descricao})`).join(' | ') || 'nenhuma')
  const caso2Ok = r2.ok && Number(n2?.valor) === 0 && n2?.status === 'cancelado'
    && (cred ?? []).length === 1 && Number((cred ?? [{}])[0].valor) === -200

  console.log('\nRESULTADO:', caso1Ok && caso2Ok ? 'PASSOU nos dois casos' : 'FALHOU')
  process.exitCode = caso1Ok && caso2Ok ? 0 : 1
} finally {
  await limpar()
  const { data: sobra } = await s.from('lancamentos').select('id').eq('pessoa_nome', NOME)
  const { data: pessoa } = await s.from('pessoas').select('id').eq('nome', NOME)
  console.log('limpeza: lançamentos restantes', (sobra ?? []).length, '| pessoas restantes', (pessoa ?? []).length)
}
