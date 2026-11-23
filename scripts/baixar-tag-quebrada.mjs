// SÓ GRAVA COM --gravar: tira do estoque vendável a TAG quebrada e marca a devolução como
// avaria.
//
// O caso (23/11/2026): a venda #12938 vendeu 1 TAG RASTREADORA A'GOLD TCD-06F por R$ 65,00
// para Maria Julia de Souza Ferreira Carvalho (PIX, pago em 11/11). Em 12/11 ela devolveu a
// peça, que estava quebrada — e a devolução entrou como 'sem_reembolso' com o item marcado
// 'ok', que é o status de "peça boa, volta para vender". Resultado: a peça quebrada ficou
// no estoque vendável da loja (3 unidades) e alguém poderia vendê-la.
//
// Correção: baixa de 1 unidade como PERDA (operação própria do estoque, que entra no
// livro-razão e é somada no fim do mês) e o item da devolução passa a 'avaria'.
// Nenhum valor de dinheiro muda aqui: os R$ 65,00 já estão pagos na venda, e o custo da
// peça (R$ 50,00) é o que a perda registra.
//
// Uso: node scripts/baixar-tag-quebrada.mjs [--gravar]
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

const DEVOLUCAO = '1fc5e5a7-fdf9-407a-a2c0-df0799a29d32'
const ITEM_DEVOLUCAO = 'bcdc7a5e-6f81-4aca-941b-811fc0030849'
const PRODUTO = '69d7ab578543e4a9a57c25f2'
const DEPOSITO = '63d9054d59a9c829747233d4' // PETRÓPOLIS LOJA
const OBS = 'TAG RASTREADORA A\'GOLD TCD-06F quebrada por Maria Julia de Souza Ferreira Carvalho (venda #12938) — devolvida em 12/11 e não pode voltar a ser vendida'

const { data: item } = await s.from('itens_devolucao')
  .select('id, nome, quantidade, total_item, status_produto').eq('id', ITEM_DEVOLUCAO).maybeSingle()
const { data: est } = await s.from('estoque')
  .select('id, quantidade').eq('produto_id', PRODUTO).eq('deposito_id', DEPOSITO).maybeSingle()

console.log('\nANTES')
console.log(`  item da devolução : ${item?.nome} · ${item?.quantidade} un · R$ ${brl(item?.total_item)} · status '${item?.status_produto}'`)
console.log(`  estoque na loja   : ${est?.quantidade} un (depósito PETRÓPOLIS LOJA)`)
console.log('\nDEPOIS')
console.log('  item da devolução : status \'avaria\' (peça não volta a vender)')
console.log(`  estoque na loja   : ${Number(est?.quantidade ?? 0) - 1} un — baixa de 1 unidade como PERDA`)

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado. Use --gravar.)'); process.exit(0) }

const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
fs.writeFileSync(`${dir}/tag-quebrada-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), item, estoque: est }, null, 2), 'utf8')

const { data: mov, error: errMov } = await s.rpc('movimentar_estoque', {
  p_produto_id: PRODUTO,
  p_deposito_id: DEPOSITO,
  p_operacao: 'perda',
  p_quantidade: 1,
  p_series: [],
  p_observacao: OBS,
  p_user: null,
  p_created_at: new Date().toISOString(),
})
if (errMov) { console.error('erro no estoque:', errMov.message); process.exit(1) }
console.log('\nestoque:', JSON.stringify(mov))

const { error: errItem } = await s.from('itens_devolucao').update({ status_produto: 'avaria' }).eq('id', ITEM_DEVOLUCAO)
if (errItem) { console.error('erro no item da devolução:', errItem.message); process.exit(1) }

fs.writeFileSync(`${dir}/DESFAZER-tag-quebrada-${carimbo}.sql`,
  `-- volta o item da devolução para 'ok' e devolve 1 unidade ao estoque da loja\n` +
  `UPDATE itens_devolucao SET status_produto = '${item?.status_produto ?? 'ok'}' WHERE id = '${ITEM_DEVOLUCAO}';\n` +
  `SELECT public.movimentar_estoque('${PRODUTO}', '${DEPOSITO}', 'entrada', 1, '[]'::jsonb, 'DESFAZER: baixa da TAG quebrada', null, now());\n`, 'utf8')

const { data: depoisItem } = await s.from('itens_devolucao').select('status_produto').eq('id', ITEM_DEVOLUCAO).maybeSingle()
const { data: depoisEst } = await s.from('estoque').select('quantidade').eq('produto_id', PRODUTO).eq('deposito_id', DEPOSITO).maybeSingle()
console.log(`\n✔ item: '${depoisItem?.status_produto}' · estoque na loja: ${depoisEst?.quantidade} un`)
console.log(`backup: ${dir}/tag-quebrada-antes-${carimbo}.json`)
console.log(`desfazer: ${dir}/DESFAZER-tag-quebrada-${carimbo}.sql`)
