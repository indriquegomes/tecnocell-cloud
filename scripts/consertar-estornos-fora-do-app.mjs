// Conserta os "Estorno de crédito" que ficaram PENDENTES no Financeiro mesmo com o
// dinheiro já devolvido FORA do app (grupo do WhatsApp).
//
// O caminho antigo: a loja gerava um vale, registrava a devolução como credito_conta,
// cancelava o vale (estorno de crédito) e o estorno deixava uma conta a pagar pendente.
// O dinheiro tinha voltado para o cliente no WhatsApp, mas o Financeiro mostrava a
// dívida aberta — e a atendente precisava repetir a gambiarra em cada pedido de estorno.
//
// Depois da correção, a devolução do tipo "Fora do app (WhatsApp)" já nasce PAGA.
// Este script fecha o passado: marca como pagas as contas de estorno que ainda estão
// pendentes, com a forma "Fora do app (WhatsApp)".
//
// Escreve SEMPRE backup em docs/registros-banco/<ano-mes>/ e um DESFAZER-*.sql.
// Uso: node scripts/consertar-estornos-fora-do-app.mjs        (aplica)
//      node scripts/consertar-estornos-fora-do-app.mjs --ver  (só mostra)
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const soVer = process.argv.includes('--ver')
const FORMA = 'Fora do app (WhatsApp)'

const { data, error } = await s.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, data_pagamento, data_vencimento, pessoa_nome, categoria, forma_pagamento, loja_id, devolucao_id, created_at, updated_at')
  .eq('tipo', 'pagar').eq('status', 'pendente').ilike('descricao', '%Estorno de cr%')
  .order('created_at')
if (error) throw new Error(error.message)
const linhas = data ?? []
if (!linhas.length) { console.log('Nada pendente de estorno. Nada a fazer.'); process.exit(0) }

const total = linhas.reduce((t, l) => t + Number(l.valor || 0), 0)
console.log(`Estornos pendentes: ${linhas.length} — total R$ ${brl(total)}`)
for (const l of linhas) console.log(`  R$ ${brl(l.valor)}  ${l.pessoa_nome ?? '—'}  ${l.descricao}`)
if (soVer) process.exit(0)

const agora = new Date().toISOString()
const hoje = agora.slice(0, 10)
const dir = path.join('docs', 'registros-banco', hoje.slice(0, 7))
fs.mkdirSync(dir, { recursive: true })
const carimbo = Date.now()
const backup = path.join(dir, `estornos-fora-do-app-${carimbo}.json`)
fs.writeFileSync(backup, JSON.stringify({ quando: agora, motivo: 'estorno devolvido fora do app (WhatsApp) — marcar como pago', linhas }, null, 2), 'utf8')

const ids = linhas.map((l) => l.id)
const { error: erroUp } = await s.from('lancamentos')
  .update({ status: 'pago', data_pagamento: agora, forma_pagamento: FORMA, updated_at: agora })
  .in('id', ids)
if (erroUp) { console.error('FALHOU (backup em ' + backup + '):', erroUp.message); process.exit(1) }

// valor_pago = valor linha a linha (o update em lote não aceita valor por linha).
for (const l of linhas) {
  const { error } = await s.from('lancamentos').update({ valor_pago: l.valor }).eq('id', l.id)
  if (error) { console.error(`FALHOU valor_pago de ${l.id}:`, error.message); process.exit(1) }
}

const desfazer = path.join(dir, `DESFAZER-estornos-fora-do-app-${carimbo}.sql`)
const reversao = linhas.map((l) => `update public.lancamentos set status = 'pendente', valor_pago = ${l.valor_pago ?? 'null'}, data_pagamento = ${l.data_pagamento ? `'${l.data_pagamento}'` : 'null'}, forma_pagamento = ${l.forma_pagamento ? `'${String(l.forma_pagamento).replace(/'/g, "''")}'` : 'null'}, updated_at = now() where id = '${l.id}';`).join('\n')
fs.writeFileSync(desfazer, `-- Desfaz o conserto de ${agora}\n-- Backup completo: ${path.basename(backup)}\n\n${reversao}\n`, 'utf8')

console.log(`\nOK: ${linhas.length} estorno(s) marcados como PAGOS (R$ ${brl(total)}).`)
console.log('Backup: ' + backup)
console.log('Desfazer: ' + desfazer)
