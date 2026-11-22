// DÁ BAIXA numa linha que já existe no Financeiro (pendente → pago), com backup e
// DESFAZER. DRY por padrão; grava só com `--gravar`.
//
// É o par do `lancar-despesas-novembro.mjs` (que cria linha nova). Usado quando a
// despesa já está lançada e o extrato só prova que o dinheiro saiu.
//
// Uso: node scripts/baixar-lancamento-novembro.mjs [--gravar]
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

// ─── OPERAÇÃO — uma linha por vez ───────────────────────────────────────────
// id          id do lançamento pendente
// dia         data em que o dinheiro saiu (AAAA-MM-DD)
// forma       'PIX' · 'Dinheiro' · 'Crédito TON' …
// conta       nome da conta que pagou (null = não mexe na conta)
// descricao   novo texto, só se for corrigir (null = mantém)
const OPERACAO = {
  id: 'd174cebe-3904-4c3c-892f-8cb87666a2bd',
  dia: '2026-11-03',
  forma: 'PIX',
  conta: 'PagBank Petrópolis',
  descricao: 'Aluguel loja Petrópolis — novembro/2026',
}

// ─── nada abaixo precisa mexer ──────────────────────────────────────────────
const { data: atual, error: e1 } = await s.from('lancamentos')
  .select('*').eq('id', OPERACAO.id).maybeSingle()
if (e1) throw new Error(e1.message)
if (!atual) { console.error('lançamento não encontrado:', OPERACAO.id); process.exit(1) }
if (atual.status === 'pago') { console.log('já está pago — nada a fazer'); process.exit(0) }

let contaId = atual.conta_id
if (OPERACAO.conta) {
  const { data: c, error: e2 } = await s.from('contas').select('id, nome, ativa').eq('nome', OPERACAO.conta).maybeSingle()
  if (e2) throw new Error(e2.message)
  if (!c) { console.error('conta não encontrada:', OPERACAO.conta); process.exit(1) }
  if (!c.ativa) { console.error('conta inativa:', OPERACAO.conta); process.exit(1) }
  contaId = c.id
}

const novo = {
  status: 'pago',
  valor_pago: Number(atual.valor ?? 0),
  data_pagamento: OPERACAO.dia + 'T12:00:00-03:00',
  forma_pagamento: OPERACAO.forma,
  conta_id: contaId,
  descricao: OPERACAO.descricao ?? atual.descricao,
  updated_at: new Date().toISOString(),
}

console.log('\nANTES')
console.log('  status   ', atual.status)
console.log('  descrição', atual.descricao)
console.log('  valor    ', brl(atual.valor), '· pago', brl(atual.valor_pago))
console.log('  vencimento', (atual.data_vencimento ?? '').slice(0, 10), '· pagamento', atual.data_pagamento ?? '-')
console.log('  forma    ', atual.forma_pagamento ?? '-', '· conta', atual.conta_id ?? '-')
console.log('\nDEPOIS')
console.log('  status    pago')
console.log('  descrição', novo.descricao)
console.log('  valor    ', brl(novo.valor_pago), 'pagamento', OPERACAO.dia)
console.log('  forma    ', novo.forma_pagamento, '· conta', OPERACAO.conta ?? contaId)

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado. Use --gravar depois do ok do dono.)'); process.exit(0) }

const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/baixa-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), antes: atual }, null, 2), 'utf8')

const { error } = await s.from('lancamentos').update(novo).eq('id', OPERACAO.id)
if (error) { console.error('erro ao gravar:', error.message); process.exit(1) }

const { data: depois } = await s.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, data_pagamento, forma_pagamento, conta_id').eq('id', OPERACAO.id).maybeSingle()

fs.writeFileSync(`${dir}/DESFAZER-baixa-${carimbo}.sql`,
  `UPDATE lancamentos SET status = '${atual.status}', valor_pago = ${atual.valor_pago ?? 0}, data_pagamento = ${atual.data_pagamento ? `'${atual.data_pagamento}'` : 'NULL'}, forma_pagamento = ${atual.forma_pagamento ? `'${atual.forma_pagamento}'` : 'NULL'}, conta_id = ${atual.conta_id ? `'${atual.conta_id}'` : 'NULL'}, descricao = '${(atual.descricao ?? '').replace(/'/g, "''")}', updated_at = now() WHERE id = '${atual.id}';\n`, 'utf8')

console.log('\n✔ baixado:', depois?.id)
console.log('  ', depois?.status, brl(depois?.valor_pago), (depois?.data_pagamento ?? '').slice(0, 10), depois?.forma_pagamento, depois?.descricao)
console.log(`\nbackup: ${dir}/baixa-antes-${carimbo}.json`)
console.log(`desfazer: ${dir}/DESFAZER-baixa-${carimbo}.sql`)
