import { createServiceClient } from '@/lib/supabase/server'
import { PainelVendedorClient } from './PainelVendedorClient'

export default async function PainelVendedorPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; vendedor?: string }>
}) {
  const { de, ate, vendedor: vendedorFiltro } = await searchParams
  const supabase = await createServiceClient()

  const hoje = new Date().toISOString().split('T')[0]
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dataInicio = de ?? inicioMes
  const dataFim = ate ?? hoje

  const { data: vendas } = await supabase
    .from('vendas')
    .select('id, total, desconto, vendedor_nome, created_at, forma_pagamento_id')
    .eq('status', 'concluida')
    .gte('created_at', dataInicio + 'T00:00:00')
    .lte('created_at', dataFim + 'T23:59:59')

  const todasVendas = vendas ?? []

  // Agrupa por vendedor
  const mapaVendedor: Record<string, {
    nome: string
    qtd: number
    total: number
    desconto: number
    vendas: typeof todasVendas
  }> = {}

  for (const v of todasVendas) {
    const nome = v.vendedor_nome ?? 'Sem vendedor'
    if (!mapaVendedor[nome]) {
      mapaVendedor[nome] = { nome, qtd: 0, total: 0, desconto: 0, vendas: [] }
    }
    mapaVendedor[nome].qtd++
    mapaVendedor[nome].total += v.total ?? 0
    mapaVendedor[nome].desconto += v.desconto ?? 0
    mapaVendedor[nome].vendas.push(v)
  }

  const ranking = Object.values(mapaVendedor).sort((a, b) => b.total - a.total)
  const totalGeral = todasVendas.reduce((s, v) => s + (v.total ?? 0), 0)

  // Vendas do vendedor selecionado (para o drill-down)
  let vendasVendedor: typeof todasVendas = []
  if (vendedorFiltro && mapaVendedor[vendedorFiltro]) {
    vendasVendedor = mapaVendedor[vendedorFiltro].vendas
  }

  return (
    <PainelVendedorClient
      ranking={ranking}
      totalGeral={totalGeral}
      totalVendas={todasVendas.length}
      filtros={{ de: dataInicio, ate: dataFim, vendedor: vendedorFiltro ?? '' }}
      vendasVendedor={vendasVendedor}
    />
  )
}
