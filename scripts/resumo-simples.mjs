// READ-ONLY: resumo simples de outubro/2026 e a ponte do lucro.
// Recorte do dono: compras até 28/10; INOVA fora (parcela sem data fixa); dias 29+ são novembro.
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
async function P(t, c, f, o = 'id') { const r = []; for (let p = 0; ; p++) { let q = s.from(t).select(c); if (f) q = f(q); const { data, error } = await q.order(o).range(p * 1000, p * 1000 + 999); if (error) throw new Error(t + ': ' + error.message); if (!data.length) break; r.push(...data); if (data.length < 1000) break } return r }
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const de = '2026-10-01T00:00:00-03:00', ate = '2026-11-01T00:00:00-03:00'

// fiado e vale na posição de 01/10 (reconstruído)
const rec = await P('lancamentos', 'valor, valor_pago, status, created_at, data_pagamento', (q) => q.eq('tipo', 'receber'))
function fiadoEm(dataCorte) {
  let v = 0
  for (const l of rec) {
    if (l.created_at >= dataCorte) continue
    const pago = Number(l.valor_pago ?? 0)
    const restante = Number(l.valor ?? 0) - pago
    if (l.status === 'cancelado') continue
    if (l.status === 'pendente') { v += restante; continue }
    if (l.status === 'pago' && (l.data_pagamento ?? '') >= dataCorte) v += restante
  }
  return v
}
const cr = await P('creditos_clientes', 'valor, tipo, created_at')
function valeEm(dataCorte) {
  let v = 0
  for (const c of cr) {
    if (c.created_at >= dataCorte) continue
    v += c.tipo === 'uso' ? -Number(c.valor ?? 0) : Number(c.valor ?? 0)
  }
  return v
}
const FIADO_0 = fiadoEm(de), VALE_0 = valeEm(de)
const FIADO_1 = fiadoEm(ate), VALE_1 = valeEm(ate)

// números do mês
const vendas = await P('vendas', 'id, total', (q) => q.eq('status', 'concluida').eq('uso_interno', false).gte('data', de).lt('data', ate))
const pags = []
for (let i = 0; i < vendas.length; i += 150) {
  const lote = vendas.slice(i, i + 150).map((v) => v.id)
  pags.push(...await P('pagamentos_venda', 'venda_id, valor, status', (q) => q.in('venda_id', lote)))
}
const pagoNaHora = pags.filter((p) => p.status === 'pago').reduce((t, p) => t + Number(p.valor ?? 0), 0)
const valeUsadoVenda = pags.filter((p) => p.status === 'vale').reduce((t, p) => t + Number(p.valor ?? 0), 0)
const movs = await P('movimentos_caixa', 'tipo, forma_pagamento, valor', (q) => q.gte('created_at', de).lt('created_at', ate), 'created_at')
const fiadoRecebido = movs.filter((m) => m.tipo === 'recebimento').reduce((t, m) => t + Number(m.valor ?? 0), 0)

const ENTRADAS = pagoNaHora + fiadoRecebido
const FORNECEDORES_PIX = 177863.79
const ESPECIE_FORNECEDOR = 25700.00
const CNPJ_PROPRIO = 74338.29
const ISA = 5872.47
const SEM_CADASTRO = 922.00
const SAIDAS = FORNECEDORES_PIX + ESPECIE_FORNECEDOR + CNPJ_PROPRIO + ISA + SEM_CADASTRO
const SOBRA = ENTRADAS - SAIDAS

const ESTOQUE_0 = 455129.14, ESTOQUE_1 = 458898.31
const COMPRAS = 194884.18
const CMV = ESTOQUE_0 + COMPRAS - ESTOQUE_1
const PERDAS = 3.72
const DIVIDA_LOJAS = 14520.10, DIVIDA_INOVA = 35495.30
const CAIXA = 59163.00, PAGBANK = 17141.79

console.log('RESUMO SIMPLES DE OUTUBRO (compras até 28/10 · INOVA fora · 29+ = novembro)')
console.log()
console.log('ENTROU DE DINHEIRO')
console.log('  vendas pagas na hora .............', brl(pagoNaHora))
console.log('  fiado recebido ...................', brl(fiadoRecebido))
console.log('  TOTAL ............................', brl(ENTRADAS))
console.log()
console.log('SAIU DE DINHEIRO')
console.log('  fornecedores por PIX .............', brl(FORNECEDORES_PIX))
console.log('  fornecedores em dinheiro vivo ....', brl(ESPECIE_FORNECEDOR))
console.log('  conta oficial (folha/custo) ......', brl(CNPJ_PROPRIO))
console.log('  Isabela (parcela) ................', brl(ISA))
console.log('  2 sem cadastro ...................', brl(SEM_CADASTRO))
console.log('  TOTAL ............................', brl(SAIDAS))
console.log()
console.log('SOBROU DE DINHEIRO NO MÊS ..........', brl(SOBRA))
console.log()
console.log('ESTOQUE')
console.log('  30/09 ............................', brl(ESTOQUE_0))
console.log('  compras que entraram (até 28/10) ..', brl(COMPRAS))
console.log('  31/10 ............................', brl(ESTOQUE_1))
console.log('  custo do que foi vendido .........', brl(CMV))
console.log('  variação do estoque ..............', brl(ESTOQUE_1 - ESTOQUE_0))
console.log('  perdas do mês ....................', brl(PERDAS))
console.log()
console.log('FIADO E VALE')
console.log('  fiado em aberto 01/10 ............', brl(FIADO_0))
console.log('  fiado em aberto 31/10 ............', brl(FIADO_1), '(variação', brl(FIADO_1 - FIADO_0) + ')')
console.log('  vale-crédito 01/10 ...............', brl(VALE_0))
console.log('  vale-crédito 31/10 ...............', brl(VALE_1), '(variação', brl(VALE_1 - VALE_0) + ')')
console.log()
console.log('DÍVIDAS EM 31/10')
console.log('  lojas (outubro) ..................', brl(DIVIDA_LOJAS))
console.log('  INOVA ............................', brl(DIVIDA_INOVA), '(fora do fechamento — sem data fixa)')
console.log()
console.log('CAIXA E BANCO EM 31/10')
console.log('  dinheiro em mãos .................', brl(CAIXA))
console.log('  PagBank ..........................', brl(PAGBANK))
console.log('  TOTAL ............................', brl(CAIXA + PAGBANK))
console.log()
// lucro por competência
const RESULTADO = (vendas.reduce((t, v) => t + Number(v.total ?? 0), 0)) // faturamento
const devol = await P('devolucoes', 'valor_total', (q) => q.gte('created_at', de).lt('created_at', ate))
const DEVOL = devol.reduce((t, d) => t + Number(d.valor_total ?? 0), 0)
const desp = await P('lancamentos', 'valor, categoria', (q) => q.eq('tipo', 'pagar').eq('status', 'pago').gte('data_pagamento', de).lt('data_pagamento', ate))
const EX = new Set(['Fornecedor / Mercadoria', 'Mercadoria', 'Vale crédito usado', 'Uso interno'])
const DESP = desp.filter((d) => !EX.has(d.categoria ?? '')).reduce((t, d) => t + Number(d.valor ?? 0), 0)
const LUCRO = RESULTADO - DEVOL - CMV - DESP
console.log('LUCRO PELA COMPETÊNCIA')
console.log('  faturamento ......................', brl(RESULTADO))
console.log('  (−) devoluções ...................', brl(-DEVOL))
console.log('  (−) custo da mercadoria vendida ..', brl(-CMV))
console.log('  (−) custos operacionais ..........', brl(-DESP))
console.log('  = LUCRO ..........................', brl(LUCRO))
console.log()
console.log('PONTE (fecha?)')
const patrimonio1 = CAIXA + PAGBANK + ESTOQUE_1 + FIADO_1 - DIVIDA_LOJAS - VALE_1
const patrimonio0 = 13665.86 + ESTOQUE_0 + FIADO_0 - VALE_0 // dívida de 01/10 não conhecida
console.log('  patrimônio 31/10 (caixa+banco+estoque+fiado−dívida lojas−vale):', brl(patrimonio1))
console.log('  patrimônio 01/10 sem a dívida da época:', brl(patrimonio0))
console.log('  dívida que teria de existir em 01/10 para fechar o lucro:', brl(patrimonio1 - patrimonio0 - LUCRO))
