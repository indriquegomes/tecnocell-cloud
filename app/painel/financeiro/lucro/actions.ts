'use server'

import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'

// Relatório de Lucro Mensal + Ciclo Inova.
// Cruza COMPRAS (custo) × VENDAS (faturamento + custo vendido) por mês/loja, e também
// agrupa o custo vendido em ciclos de 10 dias (1-10, 11-20, 21-fim) — é quanto o dono
// paga à Inova a cada 10 dias. "Custo vendido" usa o preco_custo ATUAL do produto
// (aproximação aceita; o custo histórico por venda não fica gravado no itens_venda).
export interface LinhaLucro {
  mes: string            // 'YYYY-MM'
  lojaId: string | null
  lojaNome: string
  faturamento: number   // vendas concluídas (preço de venda)
  custoVendido: number  // itens vendidos × preco_custo
  compras: number       // itens de nota de entrada (custo)
  lucroBruto: number    // faturamento - custoVendido
  vendeuMaisQueComprou: boolean
  estoqueDrenado: number // max(0, custoVendido - compras)
}

export interface CicloInova {
  mes: string
  lojaNome: string
  ciclo1: number // dias 1-10
  ciclo2: number // dias 11-20
  ciclo3: number // dias 21-fim
}

export interface ResumoLucro {
  linhas: LinhaLucro[]
  meses: string[]
  inova: CicloInova[]
}

const chave = (mes: string, lojaId: string | null) => `${mes}|${lojaId ?? ''}`

// data YYYY-MM-DD válida? ignora placeholder '1899-12-30' etc.
const dataValida = (d: string) => /^20\d{2}-/.test(d || '')

// ciclo do dia: 1..10 -> 1, 11..20 -> 2, 21..31 -> 3
const cicloDoDia = (dia: number) => (dia <= 10 ? 1 : dia <= 20 ? 2 : 3)

export async function relatorioLucroMensal(): Promise<ResumoLucro> {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  // Loja/depósito: id -> { nome, loja_id }
  const depositos = await fetchAll<{ id: string; nome: string; loja_id: string | null }>((from, to) =>
    supabase.from('depositos').select('id, nome, loja_id').order('id').range(from, to))
  const depMap = new Map(depositos.map((d) => [d.id, d]))

  // Nome da LOJA (Petrópolis/Teresópolis), não do depósito (há LOJA + ESTOQUE por loja)
  const lojas = await fetchAll<{ id: string; nome: string }>((from, to) =>
    supabase.from('lojas').select('id, nome').order('id').range(from, to))
  const lojaNome = new Map(lojas.map((l) => [l.id, l.nome]))
  const nomeDe = (dep?: { nome: string; loja_id: string | null }): string =>
    (dep?.loja_id ? lojaNome.get(dep.loja_id) : undefined) ?? dep?.nome ?? 'Sem loja'

  // Custo atual por produto
  const produtos = await fetchAll<{ id: string; preco_custo: number | null }>((from, to) =>
    supabase.from('produtos').select('id, preco_custo').order('id').range(from, to))
  const custoProd = new Map(produtos.map((p) => [p.id, Number(p.preco_custo) || 0]))

  // Vendas concluídas: id -> { deposito_id, created_at, total }
  const vendas = await fetchAll<{ id: string; deposito_id: string | null; created_at: string; total: number }>((from, to) =>
    supabase.from('vendas').select('id, deposito_id, created_at, total').eq('status', 'concluida').order('id').range(from, to))
  const vendaPorId = new Map(vendas.map((v) => [v.id, v]))

  // Notas de entrada: id -> { data, status }
  const notas = await fetchAll<{ id: string; data_entrada: string; status: string }>((from, to) =>
    supabase.from('notas_entrada').select('id, data_entrada, status').order('id').range(from, to))
  const notaPorId = new Map(notas.map((n) => [n.id, n]))

  const agg = new Map<string, LinhaLucro>()
  const inovaMap = new Map<string, CicloInova>()
  const pega = (mes: string, lojaId: string | null, lojaNome: string): LinhaLucro => {
    const k = chave(mes, lojaId)
    let l = agg.get(k)
    if (!l) {
      l = { mes, lojaId, lojaNome, faturamento: 0, custoVendido: 0, compras: 0, lucroBruto: 0, vendeuMaisQueComprou: false, estoqueDrenado: 0 }
      agg.set(k, l)
    }
    return l
  }
  const pegaInova = (mes: string, lojaId: string | null, lojaNome: string): CicloInova => {
    const k = chave(mes, lojaId)
    let c = inovaMap.get(k)
    if (!c) { c = { mes, lojaNome, ciclo1: 0, ciclo2: 0, ciclo3: 0 }; inovaMap.set(k, c) }
    return c
  }

  // Faturamento
  for (const v of vendas) {
    if (!dataValida(v.created_at)) continue
    const dep = v.deposito_id ? depMap.get(v.deposito_id) : undefined
    const l = pega((v.created_at || '').slice(0, 7), dep?.loja_id ?? v.deposito_id ?? null, nomeDe(dep))
    l.faturamento += Number(v.total) || 0
  }

  // Custo vendido (itens × preco_custo atual) + ciclo Inova por dia
  const itens = await fetchAll<{ venda_id: string; produto_id: string; quantidade: number }>((from, to) =>
    supabase.from('itens_venda').select('venda_id, produto_id, quantidade').order('id').range(from, to))
  for (const i of itens) {
    const v = vendaPorId.get(i.venda_id)
    if (!v || !dataValida(v.created_at)) continue
    const dep = v.deposito_id ? depMap.get(v.deposito_id) : undefined
    const lojaId = dep?.loja_id ?? v.deposito_id ?? null
    const lojaNome = nomeDe(dep)
    const mes = (v.created_at || '').slice(0, 7)
    const custo = (Number(i.quantidade) || 0) * (custoProd.get(i.produto_id) || 0)
    pega(mes, lojaId, lojaNome).custoVendido += custo
    const dia = Number((v.created_at || '').slice(8, 10)) || 1
    const c = pegaInova(mes, lojaId, lojaNome)
    if (cicloDoDia(dia) === 1) c.ciclo1 += custo
    else if (cicloDoDia(dia) === 2) c.ciclo2 += custo
    else c.ciclo3 += custo
  }

  // Compras (itens de nota de entrada, por depósito)
  const itensNota = await fetchAll<{ nota_id: string; deposito_id: string | null; total_item: number }>((from, to) =>
    supabase.from('itens_nota_entrada').select('nota_id, deposito_id, total_item').order('id').range(from, to))
  for (const it of itensNota) {
    const n = notaPorId.get(it.nota_id)
    if (!n || n.status === 'cancelada') continue
    const dep = it.deposito_id ? depMap.get(it.deposito_id) : undefined
    const l = pega((n.data_entrada || '').slice(0, 7), dep?.loja_id ?? it.deposito_id ?? null, nomeDe(dep))
    l.compras += Number(it.total_item) || 0
  }

  // Derivados
  const linhas = [...agg.values()].map((l) => {
    l.lucroBruto = Math.round((l.faturamento - l.custoVendido) * 100) / 100
    l.vendeuMaisQueComprou = l.custoVendido > l.compras + 0.005
    l.estoqueDrenado = Math.max(0, Math.round((l.custoVendido - l.compras) * 100) / 100)
    return l
  }).sort((a, b) => `${b.mes}|${a.lojaNome}`.localeCompare(`${a.mes}|${b.lojaNome}`))

  const meses = [...new Set(linhas.map((l) => l.mes))].sort()
  const inova = [...inovaMap.values()].map((c) => ({
    ...c,
    ciclo1: Math.round(c.ciclo1 * 100) / 100,
    ciclo2: Math.round(c.ciclo2 * 100) / 100,
    ciclo3: Math.round(c.ciclo3 * 100) / 100,
  })).sort((a, b) => `${b.mes}|${a.lojaNome}`.localeCompare(`${a.mes}|${b.lojaNome}`))

  return { linhas, meses, inova }
}
