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

  const [{ data: vendas }, { data: pedidos }] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, total, desconto, vendedor_nome, created_at')
      .eq('status', 'concluida')
      .gte('created_at', dataInicio + 'T00:00:00')
      .lte('created_at', dataFim + 'T23:59:59'),
    supabase
      .from('pedidos')
      .select('id, status')
      .gte('created_at', dataInicio + 'T00:00:00')
      .lte('created_at', dataFim + 'T23:59:59'),
  ])

  const todasVendas = vendas ?? []
  const todosPedidos = pedidos ?? []

  // Agrupa por vendedor
  const mapaVendedor: Record<string, {
    nome: string; qtd: number; total: number; desconto: number
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

  // Vendas diárias para o gráfico
  const mapaDia: Record<string, number> = {}
  for (const v of todasVendas) {
    const dia = v.created_at.slice(0, 10)
    mapaDia[dia] = (mapaDia[dia] ?? 0) + (v.total ?? 0)
  }
  const vendasDiarias = Object.entries(mapaDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, total]) => ({ dia, total }))

  // Resumo pedidos
  const orcamentos = todosPedidos.filter(p => p.status === 'orcamento').length
  const finalizados = todosPedidos.filter(p => p.status === 'aprovado').length
  const cancelados = todosPedidos.filter(p => p.status === 'cancelado').length

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
      vendasDiarias={vendasDiarias}
      resumoPedidos={{ orcamentos, finalizados, cancelados }}
    />
  )
}
