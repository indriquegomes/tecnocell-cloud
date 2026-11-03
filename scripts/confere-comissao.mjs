// CONFERE A COMISSÃO E A META DE UM MÊS — somente leitura.
//
//   node scripts/confere-comissao.mjs            → outubro/2026
//   node scripts/confere-comissao.mjs 2026-11    → novembro/2026
//
// Mostra, por loja: venda bruta, devoluções das vendas do mês, faixa batida,
// valor da meta e da comissão, e quanto cabe a cada vendedora. Depois compara
// com o que já está lançado em Contas a Pagar (categoria Comissão).
//
// Regras (definidas pelo dono, 02-03/11/2026):
//   META      = % da faixa batida, conferida na VENDA BRUTA da loja. Paga no 5º dia útil.
//   COMISSÃO  = 0,5% da venda bruta MENOS as devoluções daquele mês. Paga no dia 20.
//   Divisão   = igual entre as vendedoras da própria loja (cada um na sua loja).
//   Devolução dentro do mesmo mês é 0x0; devolução no mês seguinte desconta do mês da venda.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const linha of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^([A-Za-z_0-9]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const money = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MES = process.argv[2] || '2026-10'
const [ano, mm] = MES.split('-').map(Number)
const inicio = `${MES}-01`
const fim = mm === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mm + 1).padStart(2, '0')}-01`
const proxMes = fim.slice(0, 7)

// Quem divide em cada loja (edite aqui quando o time mudar)
const PET = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946'
const TERE = '81791d01-dc4a-485c-bbb8-f2b4cda6731c'
const TIME = {
  [PET]: ['Brunna Furtado Gonçalves', 'Maria Eduarda Kappler da Silva', 'Mariana Vila Real Castelli'],
  [TERE]: ['Leticia de Oliveira Amaro', 'Rodrigo Carvalho de Rezende Junior', 'Vitória Ranyelle de Paiva Silva'],
}

async function tudo(q) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q().range(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (!data || data.length < 1000) break
  }
  return out
}

const { data: cfg, error: erroCfg } = await sb.from('configuracoes').select('valor').eq('chave', `metas_comissao:${MES}`).maybeSingle()
if (erroCfg || !cfg) {
  console.error(`Sem metas cadastradas para ${MES}. Cadastre em configuracoes, chave metas_comissao:${MES}.`)
  process.exit(1)
}
const metas = cfg.valor

const { data: deps } = await sb.from('depositos').select('id, loja_id')
const lojaDoDep = new Map((deps ?? []).map((d) => [d.id, d.loja_id]))

const vendas = await tudo(() => sb.from('vendas').select('id, total, deposito_id').gte('data', inicio).lt('data', fim).eq('status', 'concluida'))
const bruto = { [PET]: 0, [TERE]: 0 }
const lojaDaVenda = new Map()
for (const v of vendas) {
  const loja = lojaDoDep.get(v.deposito_id)
  lojaDaVenda.set(v.id, loja)
  if (bruto[loja] != null) bruto[loja] += Number(v.total || 0)
}
const devolucoes = await tudo(() => sb.from('devolucoes').select('venda_id, valor_total'))
const dev = { [PET]: 0, [TERE]: 0 }
for (const d of devolucoes) {
  const loja = lojaDaVenda.get(d.venda_id)
  if (dev[loja] != null) dev[loja] += Number(d.valor_total || 0)
}

console.log(`\n=== ${MES} — conferência de meta e comissão\n`)
const esperado = {}
for (const loja of [PET, TERE]) {
  const escada = metas.lojas[loja]
  const faixas = [['granada', escada.granada], ['esmeralda', escada.esmeralda], ['diamante', escada.diamante], ['joalheria', escada.joalheria]]
  const pct = metas.percentuais
  const batida = faixas.filter(([, alvo]) => bruto[loja] >= Number(alvo)).pop()
  const proxima = faixas.find(([, alvo]) => bruto[loja] < Number(alvo))
  const valorMeta = batida ? Number(batida[1]) * pct[batida[0]] : 0
  const valorComissao = Math.round((bruto[loja] - dev[loja]) * metas.comissao * 100) / 100
  const time = TIME[loja]
  const nomeLoja = loja === PET ? 'Petrópolis' : 'Teresópolis'

  console.log(`${nomeLoja}  (${time.length} vendedoras)`)
  console.log(`  venda bruta .......... ${money(bruto[loja])}`)
  console.log(`  devoluções do mês .... ${money(dev[loja])}`)
  console.log(`  base da comissão ..... ${money(bruto[loja] - dev[loja])}`)
  console.log(`  faixa batida ......... ${batida ? `${batida[0]} (${pct[batida[0]] * 100}% de ${money(batida[1])})` : 'NENHUMA'}`)
  if (proxima) console.log(`  próxima faixa ........ ${proxima[0]} ${money(proxima[1])} — faltaram ${money(Number(proxima[1]) - bruto[loja])}`)
  console.log(`  META da loja ......... ${money(valorMeta)}  ÷ ${time.length} = ${money(valorMeta / time.length)}`)
  console.log(`  COMISSÃO da loja ..... ${money(valorComissao)}  ÷ ${time.length} = ${money(valorComissao / time.length)}\n`)
  for (const p of time) esperado[`${p}|${loja}`] = { meta: valorMeta / time.length, comissao: valorComissao / time.length, loja }
}

// compara com o que está lançado
const lancados = await tudo(() => sb.from('lancamentos')
  .select('pessoa_nome, valor, data_vencimento, loja_id, descricao')
  .eq('tipo', 'pagar').eq('categoria', 'Comissão').in('data_vencimento', [`${proxMes}-07`, `${proxMes}-20`]))
console.log('Conferência com o que está lançado em Contas a Pagar:\n')
let ok = 0
let falhas = 0
for (const [chave, e] of Object.entries(esperado)) {
  const [pessoa, loja] = chave.split('|')
  const doMesmo = lancados.filter((l) => l.pessoa_nome === pessoa && l.loja_id === loja)
  const metaLanc = doMesmo.filter((l) => (l.data_vencimento || '').startsWith(`${proxMes}-07`)).reduce((s, l) => s + Number(l.valor), 0)
  const comLanc = doMesmo.filter((l) => (l.data_vencimento || '').startsWith(`${proxMes}-20`)).reduce((s, l) => s + Number(l.valor), 0)
  const bate = Math.abs(metaLanc - e.meta) < 0.02 && Math.abs(comLanc - e.comissao) < 0.02
  if (bate) ok++; else falhas++
  console.log(`  ${bate ? 'OK ' : 'DIF'} ${pessoa.slice(0, 30).padEnd(30)} meta ${money(e.meta).padStart(8)} (lançado ${money(metaLanc).padStart(8)}) · comissão ${money(e.comissao).padStart(8)} (lançado ${money(comLanc).padStart(8)})`)
}
console.log(`\n${ok} conferem · ${falhas} divergências`)
console.log('Lembre: a COMISSÃO só é definitiva no dia 20 — devolução de venda do mês que voltar até lá reduz o valor.\n')
