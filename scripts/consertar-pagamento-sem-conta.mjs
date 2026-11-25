// PAGAMENTO PAGO SEM CONTA — completa de onde saiu o dinheiro.
//
// A conta do dinheiro (lib/saldos-contas.ts) só debita `lancamentos.conta_id`. Um
// pagamento marcado como pago SEM conta não baixa de conta nenhuma: o saldo do banco
// fica inflado e o fechamento não fecha. Em 25/11/2026: 699 de 1.000 pagamentos
// pagos dos últimos 31 dias estavam assim (R$ 372 mil no recorte), todos com forma em
// texto livre ("PIX", "dinheiro").
//
// A régua é a MESMA do app (`lib/conta-da-forma.ts`):
//   dinheiro → não é conta (cédula vive na gaveta) → não mexe
//   cartão/PIX → conta destino cadastrada na forma
//   forma sem destino → banco ativo da loja, se houver exatamente UM
// Se a resposta não for única e óbvia, a linha NÃO é tocada — fica no relatório.
//
// Backup + DESFAZER em docs/registros-banco/<ano-mês>/.
// Uso: node scripts/consertar-pagamento-sem-conta.mjs        (aplica)
//      node scripts/consertar-pagamento-sem-conta.mjs --ver  (só mostra)
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const BR = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const soVer = process.argv.includes('--ver')
const INICIO_COFRE = '2026-11-01T00:00:00-03:00'
const FORMAS_ESPECIAIS = new Set([
  'dinheiro', 'vale crédito', 'vale credito', 'desconto', 'troca', 'crédito loja (fiado)',
  'pix do cliente ao fornecedor', 'fora_do_app', 'fora do app (whatsapp)', 'estorno fora do app', '',
])

async function tudo(q) {
  const o = []
  for (let i = 0; i < 60; i++) {
    const { data, error } = await q(i * 1000, i * 1000 + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    o.push(...data)
    if (data.length < 1000) break
  }
  return o
}

const [formas, contas, linhas] = await Promise.all([
  s.from('formas_pagamento').select('nome, tipo, conta_destino_id, ativo').then((r) => r.data ?? []),
  s.from('contas').select('id, nome, tipo, ativo, loja_id').then((r) => r.data ?? []),
  tudo((a, b) => s.from('lancamentos')
    .select('id, descricao, valor, tipo, status, forma_pagamento, conta_id, loja_id, data_pagamento, pessoa_nome')
    .eq('tipo', 'pagar').eq('status', 'pago').is('conta_id', null)
    .gte('data_pagamento', INICIO_COFRE).order('id').range(a, b)),
])

const nomeConta = new Map(contas.map((c) => [c.id, c.nome]))
const bancosAtivos = contas.filter((c) => c.ativo !== false && c.tipo === 'banco')
const formaPorTexto = (texto) => {
  const t = (texto ?? '').trim().toLowerCase().replace(/\s+\d+x$/, '')
  return formas.find((f) => (f.nome ?? '').toLowerCase() === t || (f.tipo ?? '').toLowerCase() === t)
}

/** destino único, ou null quando não dá para decidir sem chute */
function contaDoPagamento(linha) {
  const forma = formaPorTexto(linha.forma_pagamento)
  if (forma?.tipo === 'dinheiro') return { conta: null, motivo: 'dinheiro (gaveta)' }
  if (forma?.conta_destino_id) return { conta: forma.conta_destino_id, motivo: 'conta destino da forma' }
  const daLoja = linha.loja_id ? bancosAtivos.filter((c) => c.loja_id === linha.loja_id) : []
  if (daLoja.length === 1) return { conta: daLoja[0].id, motivo: 'banco único da loja' }
  if (!linha.loja_id && bancosAtivos.length === 1) return { conta: bancosAtivos[0].id, motivo: 'banco único ativo' }
  return { conta: null, motivo: 'sem destino único' }
}

const alvo = []
const pulados = []
for (const l of linhas) {
  const texto = (l.forma_pagamento ?? '').trim().toLowerCase()
  if (FORMAS_ESPECIAIS.has(texto)) { pulados.push({ l, motivo: 'forma que não move conta (' + (texto || 'vazia') + ')' }); continue }
  const { conta, motivo } = contaDoPagamento(l)
  if (!conta) { pulados.push({ l, motivo }); continue }
  alvo.push({ ...l, destino: conta, motivo })
}

const porForma = {}
for (const a of alvo) {
  const k = (a.forma_pagamento ?? '(vazia)') + ' → ' + (nomeConta.get(a.destino) ?? a.destino)
  porForma[k] = porForma[k] ?? { q: 0, v: 0 }
  porForma[k].q++
  porForma[k].v += Number(a.valor ?? 0)
}

console.log(`Pagamentos pagos sem conta desde ${INICIO_COFRE.slice(0, 10)}: ${linhas.length}`)
console.log(`Com destino único e óbvio (serão corrigidos): ${alvo.length} — R$ ${BR(alvo.reduce((t, a) => t + Number(a.valor ?? 0), 0))}`)
console.log(`Pulados: ${pulados.length}\n`)
for (const [k, v] of Object.entries(porForma).sort((a, b) => b[1].v - a[1].v)) {
  console.log(`  ${String(v.q).padStart(4)}x R$ ${BR(v.v).padStart(12)}  ${k}`)
}
const motivos = {}
for (const p of pulados) motivos[p.motivo] = motivos[p.motivo] ?? { q: 0, v: 0 }
for (const p of pulados) { motivos[p.motivo].q++; motivos[p.motivo].v += Number(p.l.valor ?? 0) }
console.log('\nPulados por motivo:')
for (const [k, v] of Object.entries(motivos).sort((a, b) => b[1].q - a[1].q)) {
  console.log(`  ${String(v.q).padStart(4)}x R$ ${BR(v.v).padStart(12)}  ${k}`)
}
console.log('\nAmostra (10 linhas que vão ser corrigidas):')
for (const a of alvo.slice(0, 10)) {
  console.log(`  R$ ${BR(a.valor).padStart(10)} | ${(a.forma_pagamento ?? '-').padEnd(14)} | ${(a.data_pagamento ?? '').slice(0, 10)} | ${(a.descricao ?? '').slice(0, 40).padEnd(40)} → ${nomeConta.get(a.destino) ?? a.destino} (${a.motivo})`)
}

if (soVer) process.exit(0)
if (!alvo.length) { console.log('\nNada a corrigir.'); process.exit(0) }

const agora = new Date().toISOString()
const dir = path.join('docs', 'registros-banco', agora.slice(0, 7))
fs.mkdirSync(dir, { recursive: true })
const carimbo = Date.now()
const backup = path.join(dir, `pagamento-sem-conta-${carimbo}.json`)
fs.writeFileSync(backup, JSON.stringify({ quando: agora, regra: 'contaDaForma (lib/conta-da-forma.ts)', corrigidos: alvo.map((a) => ({ id: a.id, valor: a.valor, forma: a.forma_pagamento, destino: a.destino, motivo: a.motivo })), pulados: pulados.map((p) => ({ id: p.l.id, motivo: p.motivo })) }, null, 2), 'utf8')

let n = 0
for (const a of alvo) {
  const { error } = await s.from('lancamentos').update({ conta_id: a.destino, updated_at: agora }).eq('id', a.id)
  if (error) { console.error(`FALHOU ${a.id}: ${error.message} (backup: ${backup})`); process.exit(1) }
  n++
}

const desfazer = path.join(dir, `DESFAZER-pagamento-sem-conta-${carimbo}.sql`)
fs.writeFileSync(desfazer, `-- Desfaz a correção de ${agora} (backup: ${path.basename(backup)})\n\nupdate public.lancamentos set conta_id = null, updated_at = now()\n where id in (\n${alvo.map((a) => `  '${a.id}'`).join(',\n')}\n);\n`, 'utf8')

console.log(`\nOK: ${n} pagamento(s) ganharam conta.`)
console.log('Backup: ' + backup)
console.log('Desfazer: ' + desfazer)
