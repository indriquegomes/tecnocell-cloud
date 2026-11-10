import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP, diaSP } from '@/lib/utils'
import { PainelVendedorClient } from './PainelVendedorClient'

export default async function PainelVendedorPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; vendedor?: string }>
}) {
  const { de, ate, vendedor: vendedorFiltro } = await searchParams
  const supabase = await createServiceClient()

  const hoje = hojeSP()
  const inicioMes = hojeSP().slice(0, 8) + '01'
  const dataInicio = de ?? inicioMes
  const dataFim = ate ?? hoje

  // fetchAll: sem isso o cap de 1000 do PostgREST subcontaria totalGeral/ranking/gráfico
  // quando o período tivesse >1000 vendas.
  type VVenda = { id: string; total: number; desconto: number; vendedor_nome: string | null; created_at: string; deposito_id: string | null }
  type VPedido = { id: string; tipo: string; status: string }
  const [vendas, pedidos, { data: configPdv }, { data: deps }, { data: lojas }, { data: cfgTime }, devolucoes] = await Promise.all([
    fetchAll<VVenda>((from, to) =>
      supabase
        .from('vendas')
        .select('id, total, desconto, vendedor_nome, created_at, deposito_id')
        .eq('status', 'concluida')
        .gte('created_at', dataInicio + 'T00:00:00-03:00')
        .lte('created_at', dataFim + 'T23:59:59-03:00')
        .range(from, to)),
    fetchAll<VPedido>((from, to) =>
      supabase
        .from('pedidos')
        .select('id, tipo, status')
        .gte('created_at', dataInicio + 'T00:00:00-03:00')
        .lte('created_at', dataFim + 'T23:59:59-03:00')
        .range(from, to)),
    supabase.from('configuracoes').select('valor').eq('chave', 'pdv').maybeSingle(),
    supabase.from('depositos').select('id, loja_id'),
    supabase.from('lojas').select('id, nome'),
    supabase.from('configuracoes').select('valor').eq('chave', 'time_comissao').maybeSingle(),
    fetchAll<{ venda_id: string | null; valor_total: number | null }>((from, to) =>
      supabase.from('devolucoes').select('venda_id, valor_total').range(from, to)),
  ])

  // Comissão: 0,5% de (venda bruta − devoluções) por LOJA, dividida igualmente pelo
  // time da loja. Não é por vendedor — o nome na venda é histórico.
  const comissaoPct = Number((configPdv?.valor as Record<string, number> | null)?.comissao_percentual ?? 0)
  const timeComissao = ((cfgTime?.valor ?? {}) as Record<string, string[]>)
  const nomeDaLoja = Object.fromEntries(((lojas ?? []) as { id: string; nome: string }[]).map((l) => [l.id, l.nome]))
  const lojaDoDep = new Map(((deps ?? []) as { id: string; loja_id: string | null }[]).map((d) => [d.id, d.loja_id]))
  const lojaDaVenda = new Map<string, string | null>()
  const brutoLoja: Record<string, number> = {}
  for (const v of vendas ?? []) {
    const loja = v.deposito_id ? lojaDoDep.get(v.deposito_id) ?? null : null
    lojaDaVenda.set(v.id, loja)
    if (!loja) continue
    brutoLoja[loja] = (brutoLoja[loja] ?? 0) + (v.total ?? 0)
  }
  const devolvidoLoja: Record<string, number> = {}
  for (const d of devolucoes ?? []) {
    const loja = d.venda_id ? lojaDaVenda.get(d.venda_id) : null
    if (!loja) continue
    devolvidoLoja[loja] = (devolvidoLoja[loja] ?? 0) + Number(d.valor_total ?? 0)
  }
  const comissoesLoja = Object.entries(brutoLoja).map(([loja, bruto]) => {
    const comissao = Math.round((bruto - (devolvidoLoja[loja] ?? 0)) * (comissaoPct / 100) * 100) / 100
    const time = (timeComissao[loja] ?? []).filter(Boolean).length
    return {
      loja: nomeDaLoja[loja] ?? 'Loja',
      comissao,
      time,
      porPessoa: time > 0 ? Math.round((comissao / time) * 100) / 100 : 0,
    }
  }).sort((a, b) => b.comissao - a.comissao)
  // Metas pessoais não entram aqui: a meta é da loja. O painel por vendedor mostra
  // só o que cada pessoa atendeu (histórico), não meta nem comissão individual.
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

  const ranking = Object.values(mapaVendedor)
    .sort((a, b) => b.total - a.total)
  const totalGeral = todasVendas.reduce((s, v) => s + (v.total ?? 0), 0)

  // Vendas diárias para o gráfico
  const mapaDia: Record<string, number> = {}
  for (const v of todasVendas) {
    const dia = diaSP(v.created_at)
    mapaDia[dia] = (mapaDia[dia] ?? 0) + (v.total ?? 0)
  }
  const vendasDiarias = Object.entries(mapaDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, total]) => ({ dia, total }))

  // Resumo pedidos — tipo distingue orçamento de pedido; status é o ciclo de vida
  const orcamentos = todosPedidos.filter(p => p.tipo === 'orcamento').length
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
      comissaoPct={comissaoPct}
      comissoesLoja={comissoesLoja}
    />
  )
}
