// LANÇA as despesas de novembro/2026 (item 1 = fixas, item 3 = retiradas, item 4 = variável).
//
// DRY por padrão: sem `--gravar` só mostra o de/para e o efeito. Com `--gravar`:
// backup JSON + arquivo DESFAZER.sql em docs/registros-banco/2026-11/.
//
// A régua é a do próprio app (`app/painel/financeiro/actions.ts` → criarLancamento):
//   1. valor > 0.
//   2. quitado sem conta → conta pela forma (`lib/conta-da-forma.ts`):
//      dinheiro = null (é gaveta) · cartão/PIX = conta da forma · senão banco da loja.
//   3. quitado em DINHEIRO sem conta → grava a retirada no caixa aberto da loja
//      (`lib/caixa.ts` → retirarDoCaixa), senão o fechamento acusa
//      "saíram R$ X do caixa sem destino".
//   4. não grava mais de uma vez: pula descrição + vencimento que já existem.
//
// Uso: node scripts/lancar-despesas-novembro.mjs [--gravar]
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

// ─── PLANO — preencher com o que o dono aprovar, uma despesa por linha ───────
// dia         data de vencimento/saída (AAAA-MM-DD)
// descricao   texto que aparece no Financeiro
// valor       número
// categoria   Aluguel · Contabilidade · Impostos · Energia/Luz · Internet ·
//             Retirada do sócio · Freelancer · Manutenção · Limpeza · motoboy…
// loja        'Petrópolis' ou 'Teresópolis'
// forma       'PIX', 'Dinheiro', 'Crédito TON', 'Débito PagBank'…
// pago        true = já saiu o dinheiro · false = fica pendente
// pessoa_nome quem recebeu (opcional)
const PLANO = [
]

// ─── nada abaixo precisa mexer ──────────────────────────────────────────────
// PLANO_JSON=<arquivo>: carrega um plano gerado por outro script (análise) em vez de
// digitar aqui. Útil quando a lista sai de um cruzamento automático.
if (process.env.PLANO_JSON) {
  const extra = JSON.parse(fs.readFileSync(process.env.PLANO_JSON, 'utf8'))
  if (Array.isArray(extra)) PLANO.push(...extra)
}
const { data: lojas, error: erroLojas } = await s.from('lojas').select('id, nome')
if (erroLojas) throw new Error(erroLojas.message)
const lojaPorNome = new Map(lojas.map((l) => [l.nome, l.id]))

const { data: formas } = await s.from('formas_pagamento').select('nome, tipo, conta_destino_id')
const { data: bancos } = await s.from('contas').select('id, nome, loja_id, ativa').eq('ativa', true).eq('tipo', 'banco')
const { data: todasContas } = await s.from('contas').select('id, nome')
const contaPorNome = new Map((todasContas ?? []).map((c) => [c.nome, c.id]))

// lib/conta-da-forma.ts
function contaDaForma(formaTexto, lojaId) {
  const texto = (formaTexto ?? '').trim().toLowerCase().replace(/\s+\d+x$/, '')
  if (!texto) return null
  const forma = (formas ?? []).find((f) => (f.nome ?? '').toLowerCase() === texto || (f.tipo ?? '').toLowerCase() === texto)
  if (forma?.tipo === 'dinheiro') return null
  if (forma?.conta_destino_id) return forma.conta_destino_id
  const lista = bancos ?? []
  const daLoja = lojaId ? lista.filter((c) => c.loja_id === lojaId) : []
  if (daLoja.length === 1) return daLoja[0].id
  if (lista.length === 1) return lista[0].id
  return null
}

if (!PLANO.length) {
  console.log('PLANO VAZIO — preencha `PLANO` em scripts/lancar-despesas-novembro.mjs com o que o dono aprovou.')
  process.exit(0)
}

const preparadas = []
const problemas = []
for (const [i, d] of PLANO.entries()) {
  const n = i + 1
  const lojaId = lojaPorNome.get(d.loja) ?? null
  if (!lojaId) { problemas.push(`#${n} "${d.descricao}": loja "${d.loja}" não encontrada`); continue }
  const valor = Math.round((Number(d.valor) || 0) * 100) / 100
  if (!(valor > 0)) { problemas.push(`#${n} "${d.descricao}": valor inválido`); continue }
  // Data fora de novembro/2026 não entra: outubro está fechado (a trava do app recusaria
  // e o resultado de mês auditado não pode mudar por um lançamento deste script).
  if (!/^2026-11-\d{2}$/.test(String(d.dia ?? ''))) {
    problemas.push(`#${n} "${d.descricao}": data "${d.dia}" fora de novembro/2026 — não lança`)
    continue
  }
  // conta: `conta: null` força "sem conta" (dinheiro de cartão/cofre) · `conta: 'Nome'`
  // aponta a conta explícita · sem o campo, a régua de lib/conta-da-forma.ts decide.
  let contaId = d.pago ? contaDaForma(d.forma, lojaId) : null
  if (d.pago && d.conta === null) contaId = null
  else if (d.pago && typeof d.conta === 'string') {
    contaId = contaPorNome.get(d.conta) ?? null
    if (!contaId) { problemas.push(`#${n} "${d.descricao}": conta "${d.conta}" não encontrada`); continue }
  }
  const ehDinheiro = (d.forma ?? '').trim().toLowerCase().includes('dinheiro')

  const { data: jaTem, error: eBusca } = await s.from('lancamentos')
    .select('id, valor, status').eq('tipo', 'pagar').eq('descricao', d.descricao)
    .eq('data_vencimento', d.dia).limit(1)
  if (eBusca) throw new Error(eBusca.message)

  // gaveta: quanto deveria ter AGORA no caixa aberto da loja (RPC oficial)
  let gaveta = null
  let caixaId = null
  if (d.pago && ehDinheiro && !contaId) {
    const { data: caixa } = await s.from('caixas').select('id')
      .eq('status', 'aberto').eq('loja_id', lojaId)
      .order('aberto_em', { ascending: false }).limit(1).maybeSingle()
    caixaId = caixa?.id ?? null
    if (!caixaId) problemas.push(`#${n} "${d.descricao}": sem caixa aberto na loja — a retirada NÃO vai ser registrada`)
    else {
      const { data: esperado } = await s.rpc('calcular_valor_esperado', { p_caixa_id: caixaId })
      gaveta = Number(esperado ?? 0)
      if (valor > gaveta + 0.009) problemas.push(`#${n} "${d.descricao}": gaveta tem ${brl(gaveta)} e a saída é ${brl(valor)}`)
    }
  }

  preparadas.push({
    item: n, dia: d.dia, descricao: d.descricao, valor, categoria: d.categoria ?? null,
    loja: d.loja, forma: d.forma ?? null, pago: !!d.pago, conta_id: contaId,
    ehDinheiro, caixaId, gaveta, jaTem: jaTem?.[0] ?? null, pessoa_nome: d.pessoa_nome ?? null,
    subcategoria: d.subcategoria ?? null, semMovimento: !!d.semMovimento,
  })
}

console.log(`\nPlano de lançamento — ${PLANO.length} despesa(s)\n`)
for (const p of preparadas) {
  const destino = p.conta_id ? 'conta' : !p.pago ? '—' : p.ehDinheiro ? 'GAVETA (retirada)' : 'SEM CONTA (não mexe em saldo)'
  console.log(`#${p.item} ${p.dia} ${brl(p.valor).padStart(11)} ${p.loja.padEnd(12)} ${(p.categoria ?? '-').padEnd(16)} ${(p.forma ?? '-').padEnd(12)} ${p.pago ? 'pago' : 'pendente'} · ${destino} · ${p.descricao}${p.jaTem ? '  [JÁ EXISTE — vai pular]' : ''}`)
}
const total = preparadas.reduce((t, p) => t + p.valor, 0)
console.log(`\nTotal: ${brl(total)}`)
if (problemas.length) {
  console.log('\nAVISOS:')
  for (const x of problemas) console.log('  -', x)
}

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado. Use --gravar depois do ok do dono.)'); process.exit(0) }

const novas = preparadas.filter((p) => !p.jaTem)
if (!novas.length) { console.log('\nnada a gravar'); process.exit(0) }

const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')

const linhas = novas.map((p) => ({
  id: crypto.randomUUID(),
  descricao: p.descricao,
  valor: p.valor,
  tipo: 'pagar',
  categoria: p.categoria,
  subcategoria: p.subcategoria,
  data_competencia: null,
  data_vencimento: p.dia,
  forma_pagamento: p.forma,
  pessoa_nome: p.pessoa_nome,
  pessoa_id: null,
  conta_id: p.conta_id,
  loja_id: lojaPorNome.get(p.loja) ?? null,
  status: p.pago ? 'pago' : 'pendente',
  data_pagamento: p.pago ? `${p.dia}T12:00:00-03:00` : null,
  valor_pago: p.pago ? p.valor : 0,
  updated_at: new Date().toISOString(),
}))

fs.writeFileSync(`${dir}/despesas-novembro-antes-${carimbo}.json`, JSON.stringify({ quando: new Date().toISOString(), linhas }, null, 2), 'utf8')
const { data: criadas, error } = await s.from('lancamentos').insert(linhas).select('id, valor, descricao')
if (error) { console.error('erro ao gravar:', error.message); process.exit(1) }

// retirada na gaveta das despesas pagas em dinheiro sem conta
const movimentos = []
for (const p of novas) {
  if (p.semMovimento) continue // a saída de dinheiro JÁ existe no caixa (retirada antiga)
  if (!p.pago || !p.ehDinheiro || p.conta_id || !p.caixaId) continue
  const linha = criadas.find((c) => c.descricao === p.descricao)
  movimentos.push({
    caixa_id: p.caixaId,
    tipo: 'retirada',
    motivo: `Pagamento em dinheiro — ${p.descricao}`,
    forma_pagamento: 'Dinheiro',
    valor: p.valor,
    lancamento_id: linha?.id ?? null,
    origem: 'financeiro',
  })
}
if (movimentos.length) {
  const { error: erroMov } = await s.from('movimentos_caixa').insert(movimentos)
  if (erroMov) console.error('erro ao gravar movimento de caixa:', erroMov.message)
}

fs.writeFileSync(`${dir}/DESFAZER-despesas-novembro-${carimbo}.sql`,
  `DELETE FROM movimentos_caixa WHERE lancamento_id IN (${criadas.map((l) => `'${l.id}'`).join(',')}) AND origem = 'financeiro';\nDELETE FROM lancamentos WHERE id IN (${criadas.map((l) => `'${l.id}'`).join(',')});\n`, 'utf8')

console.log(`\ngravados ${criadas.length} lançamento(s) · ${brl(criadas.reduce((t, l) => t + Number(l.valor), 0))}`)
console.log(`movimentos de caixa: ${movimentos.length}`)
for (const l of criadas) console.log(`  ✔ ${l.id}  ${brl(l.valor).padStart(11)}  ${l.descricao}`)
console.log(`\nbackup: ${dir}/despesas-novembro-antes-${carimbo}.json`)
console.log(`desfazer: ${dir}/DESFAZER-despesas-novembro-${carimbo}.sql`)
