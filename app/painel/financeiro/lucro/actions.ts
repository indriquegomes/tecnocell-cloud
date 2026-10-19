'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'

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

// A agregação agora roda NO BANCO, na função relatorio_lucro_mensal() — antes baixava
// 70.914 itens de venda + 7.360 vendas + 8.153 produtos e somava no JS (~92 requisições
// por tela, ~14s). Mesma regra, mesmo resultado (validado por diff JS antigo × RPC).
// Migration: supabase/migrations/2026-10-18_lucro-mensal-rpc.sql.
export async function relatorioLucroMensal(): Promise<ResumoLucro> {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  const { data, error } = await supabase.rpc('relatorio_lucro_mensal')
  if (error) return { linhas: [], meses: [], inova: [] }

  type RpcLinha = {
    mes: string
    loja_id: string | null
    loja_nome: string
    faturamento: number | string
    custo_vendido: number | string
    compras: number | string
    ciclo1: number | string
    ciclo2: number | string
    ciclo3: number | string
    tem_itens: boolean
  }
  const rows = (data ?? []) as RpcLinha[]

  const linhas: LinhaLucro[] = rows
    .map((r) => {
      const faturamento = Number(r.faturamento) || 0
      const custoVendido = Number(r.custo_vendido) || 0
      const compras = Number(r.compras) || 0
      return {
        mes: r.mes,
        lojaId: r.loja_id ?? null,
        lojaNome: r.loja_nome,
        faturamento,
        custoVendido,
        compras,
        lucroBruto: Math.round((faturamento - custoVendido) * 100) / 100,
        vendeuMaisQueComprou: custoVendido > compras + 0.005,
        estoqueDrenado: Math.max(0, Math.round((custoVendido - compras) * 100) / 100),
      }
    })
    .sort((a, b) => `${b.mes}|${a.lojaNome}`.localeCompare(`${a.mes}|${b.lojaNome}`))

  const inova: CicloInova[] = rows
    .filter((r) => r.tem_itens)
    .map((r) => ({
      mes: r.mes,
      lojaNome: r.loja_nome,
      ciclo1: Math.round((Number(r.ciclo1) || 0) * 100) / 100,
      ciclo2: Math.round((Number(r.ciclo2) || 0) * 100) / 100,
      ciclo3: Math.round((Number(r.ciclo3) || 0) * 100) / 100,
    }))
    .sort((a, b) => `${b.mes}|${a.lojaNome}`.localeCompare(`${a.mes}|${b.lojaNome}`))

  const meses = [...new Set(linhas.map((l) => l.mes))].sort()
  return { linhas, meses, inova }
}
