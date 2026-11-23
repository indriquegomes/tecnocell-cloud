// CONSERTA A FORMA de um recebimento de fiado — sem mexer no resto do caixa.
//
// Caso que motivou (venda #14867, DAVID DOS SANTOS MORTES, 23/11 14:44): a venda de
// R$ 100,00 ficou como fiado e às 15:39 alguém quitou marcando **PIX**, quando o certo
// era outra forma. O movimento do caixa é 'recebimento' com forma_pagamento PIX — e é
// essa coluna que decide se o valor entra na conta do banco (PIX) ou na gaveta (Dinheiro).
//
// O QUE ESTE SCRIPT NÃO FAZ: não cria nem apaga movimento, não mexe em valor, data ou
// cliente. Só troca a FORMA no movimento e no lançamento (e no histórico da baixa).
// Por isso o fechamento do caixa continua fechando: é a mesma quantia, na mesma linha.
//
// Efeito no CAIXA (gaveta) por forma escolhida:
//   Dinheiro      → a gaveta passa a esperar +valor (é dinheiro físico que ela tem)
//   PIX / Cartão  → gaveta não muda (o dinheiro está no banco/maquininha)
//   Vale Crédito  → gaveta não muda; desconta o saldo do cliente (recusa se não houver)
//
// DRY por padrão. Grava com `--gravar`. Backup + DESFAZER em docs/registros-banco/.
// Uso:
//   node scripts/corrigir-forma-recebimento.mjs --lancamento <id> --forma Dinheiro
//   node scripts/corrigir-forma-recebimento.mjs --lancamento <id> --forma "Vale Crédito" --gravar
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
const dia = (x) => (x ?? '').slice(0, 16).replace('T', ' ')
const arg = (nome) => { const i = process.argv.indexOf('--' + nome); return i >= 0 ? process.argv[i + 1] : null }

const lancamentoId = arg('lancamento')
const forma = arg('forma')
if (!lancamentoId || !forma) {
  console.error('uso: node scripts/corrigir-forma-recebimento.mjs --lancamento <id> --forma "Dinheiro|PIX|Vale Crédito" [--gravar]')
  process.exit(1)
}
const ehDinheiro = /dinheiro/i.test(forma)
const ehVale = /vale/i.test(forma)

const { data: l, error } = await s.from('lancamentos')
  .select('id, tipo, descricao, valor, valor_pago, status, forma_pagamento, data_pagamento, pessoa_id, pessoa_nome, loja_id, historico_pagamentos')
  .eq('id', lancamentoId).maybeSingle()
if (error) throw new Error(error.message)
if (!l) { console.error('lançamento não encontrado:', lancamentoId); process.exit(1) }
if (l.tipo !== 'receber') { console.error('este lançamento não é "a receber" — este script só trata fiado recebido.'); process.exit(1) }
if (l.status !== 'pago') { console.error('o lançamento não está pago — a forma é escolhida na hora da baixa.'); process.exit(1) }

const { data: movs } = await s.from('movimentos_caixa')
  .select('id, caixa_id, tipo, valor, forma_pagamento, motivo, lancamento_id, created_at')
  .eq('lancamento_id', lancamentoId).order('created_at')

// Quando o movimento não tem vínculo (acontece no fiado quitado pelo PDV), procura pelo
// motivo + valor no mesmo dia — é o único jeito de achar a linha certa sem chutar.
let mov = (movs ?? [])[0] ?? null
let achouPorHeuristica = false
if (!mov && l.pessoa_nome && l.data_pagamento) {
  const de = l.data_pagamento.slice(0, 10)
  const { data: porMotivo } = await s.from('movimentos_caixa')
    .select('id, caixa_id, tipo, valor, forma_pagamento, motivo, lancamento_id, created_at')
    .eq('tipo', 'recebimento').eq('valor', Number(l.valor_pago ?? l.valor))
    .ilike('motivo', `Fiado recebido — %${l.pessoa_nome}%`)
    .gte('created_at', de + 'T00:00:00-03:00').lt('created_at', de + 'T23:59:59-03:00')
  if ((porMotivo ?? []).length === 1) { mov = porMotivo[0]; achouPorHeuristica = true }
  if ((porMotivo ?? []).length > 1) {
    console.error('achei mais de um movimento candidato — não vou chutar:')
    for (const m of porMotivo) console.error(`  ${m.id} · ${dia(m.created_at)} · R$ ${brl(m.valor)} · ${m.forma_pagamento}`)
    process.exit(1)
  }
}

const saldoCliente = async () => {
  if (!l.pessoa_id) return 0
  const { data: cr } = await s.from('creditos_clientes').select('tipo, valor').eq('pessoa_id', l.pessoa_id)
  return Math.round((cr ?? []).reduce((t, c) => t + (['uso', 'estorno'].includes(c.tipo) ? -Number(c.valor || 0) : Number(c.valor || 0)), 0) * 100) / 100
}

console.log(`\nLANÇAMENTO: ${l.descricao} · ${dia(l.data_pagamento)} · R$ ${brl(l.valor_pago ?? l.valor)} · pago como "${l.forma_pagamento ?? '—'}"`)
console.log(`MOVIMENTO DO CAIXA: ${mov ? `${dia(mov.created_at)} · ${mov.tipo} · R$ ${brl(mov.valor)} · "${mov.forma_pagamento}"${achouPorHeuristica ? ' (achado pelo motivo + valor — sem vínculo no banco)' : ''}` : 'NENHUM — o recebimento não entrou no caixa'}`)
console.log(`\nDEPOIS: forma "${forma}"`)
console.log(`  gaveta: ${ehDinheiro ? `passa a esperar + R$ ${brl(l.valor_pago ?? l.valor)}` : 'NÃO muda (não é dinheiro)'}`)
if (ehVale) {
  const saldo = await saldoCliente()
  console.log(`  vale-crédito de ${l.pessoa_nome ?? 'cliente'}: saldo hoje R$ ${brl(saldo)} → ficaria R$ ${brl(saldo - Number(l.valor_pago ?? l.valor))}`)
  if (saldo < Number(l.valor_pago ?? l.valor) - 0.01) { console.error('  ✖ saldo insuficiente para abater no vale — não vou gravar.'); process.exit(1) }
}

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado. Use --gravar.)'); process.exit(0) }

const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/forma-recebimento-antes-${carimbo}.json`,
  JSON.stringify({ quando: new Date().toISOString(), lancamento: l, movimento: mov }, null, 2), 'utf8')

const hist = Array.isArray(l.historico_pagamentos) ? l.historico_pagamentos.map((h) => ({ ...h })) : []
for (const h of hist) if (typeof h.forma === 'string') h.forma = forma

const { error: errLanc } = await s.from('lancamentos').update({
  forma_pagamento: forma,
  historico_pagamentos: hist,
  updated_at: new Date().toISOString(),
}).eq('id', l.id)
if (errLanc) { console.error('erro no lançamento:', errLanc.message); process.exit(1) }

if (mov) {
  const { error: errMov } = await s.from('movimentos_caixa').update({ forma_pagamento: forma }).eq('id', mov.id)
  if (errMov) { console.error('erro no movimento do caixa:', errMov.message); process.exit(1) }
  // Vínculo de auditoria: sem ele o "Desfazer" do Financeiro não acha este movimento.
  if (!mov.lancamento_id) {
    const { error: errLink } = await s.from('movimentos_caixa').update({ lancamento_id: l.id, origem: 'correcao' }).eq('id', mov.id)
    if (errLink) console.error('aviso: não consegui ligar o movimento ao lançamento:', errLink.message)
  }
}

if (ehVale) {
  const { error: errUso } = await s.from('creditos_clientes').insert({
    pessoa_id: l.pessoa_id,
    pessoa_nome: l.pessoa_nome,
    loja_id: l.loja_id,
    tipo: 'uso',
    valor: Number(l.valor_pago ?? l.valor),
    descricao: `Uso no fiado #${(l.descricao ?? '').match(/#(\d+)/)?.[1] ?? ''} (correção de forma)`.trim(),
    lancamento_id: l.id,
  })
  if (errUso) { console.error('erro ao registrar uso do vale:', errUso.message); process.exit(1) }
}

const desfazer = [
  `UPDATE lancamentos SET forma_pagamento = ${l.forma_pagamento ? `'${l.forma_pagamento}'` : 'NULL'}, historico_pagamentos = '${JSON.stringify(l.historico_pagamentos ?? [])}'::jsonb, updated_at = now() WHERE id = '${l.id}';`,
  mov ? `UPDATE movimentos_caixa SET forma_pagamento = '${mov.forma_pagamento ?? ''}', lancamento_id = ${mov.lancamento_id ? `'${mov.lancamento_id}'` : 'NULL'}, origem = NULL WHERE id = '${mov.id}';` : '',
  ehVale ? `DELETE FROM creditos_clientes WHERE lancamento_id = '${l.id}' AND tipo = 'uso' AND descricao LIKE '%correção de forma%';` : '',
].filter(Boolean).join('\n') + '\n'
fs.writeFileSync(`${dir}/DESFAZER-forma-recebimento-${carimbo}.sql`, desfazer, 'utf8')

console.log(`\n✔ forma trocada para "${forma}"`)
console.log(`backup: ${dir}/forma-recebimento-antes-${carimbo}.json`)
console.log(`desfazer: ${dir}/DESFAZER-forma-recebimento-${carimbo}.sql`)
