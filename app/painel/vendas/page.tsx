import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { VendasClient } from './VendasClient'

export default async function PainelVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; busca?: string; forma?: string; status?: string; loja?: string; vendedor?: string }>
}) {
  const { de, ate, busca, forma, status, loja, vendedor } = await searchParams
  const supabase = await createServiceClient()

  const hoje = hojeSP()
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dataInicio = de ?? inicioMes
  const dataFim = ate ?? hoje

  // Carrega TODAS as vendas do período (fetchAll) — antes capava em 500 e os
  // totais do período subcontavam quando o mês passava disso.
  type VendaRow = {
    id: string; numero: number | null; total: number; desconto: number
    created_at: string; status: string; vendedor_nome: string | null
    motivo_cancelamento?: string | null; observacoes?: string | null
    pessoa_id: string | null; forma_pagamento_id: string | null; caixa_id: string | null
  }
  const [vendasRaw, { data: formasData }] = await Promise.all([
    fetchAll<VendaRow>((from, to) => {
      let q = supabase
        .from('vendas')
        .select('id, numero, total, desconto, created_at, status, vendedor_nome, pessoa_id, forma_pagamento_id, motivo_cancelamento, observacoes, caixa_id')
        .gte('created_at', dataInicio + 'T00:00:00')
        .lte('created_at', dataFim + 'T23:59:59')
        .order('created_at', { ascending: false })
        .range(from, to)
      if (status) q = q.eq('status', status)
      else q = q.neq('status', 'aberta') // exclui vendas em andamento
      return q
    }),
    supabase.from('formas_pagamento').select('id, nome').eq('ativo', true).order('nome'),
  ])

  const formas = (formasData ?? []) as { id: string; nome: string }[]
  const formaMap = Object.fromEntries(formas.map(f => [f.id, f.nome]))

  // Loja de cada venda — via CAIXA (o depósito tem loja NULL em alguns). Isa 29/07.
  // Respeita a permissão: gerente/master vê todas; atendente só a(s) permitida(s).
  const { todasLojas, permitidas, todas: vemTodas } = await lojasDoUsuario()
  const caixaIds = [...new Set((vendasRaw ?? []).map(v => v.caixa_id).filter(Boolean))] as string[]
  const { data: caixasData } = caixaIds.length
    ? await supabase.from('caixas').select('id, loja_id').in('id', caixaIds)
    : { data: [] as { id: string; loja_id: string | null }[] }
  const nomeLoja: Record<string, string> = Object.fromEntries(todasLojas.map(l => [l.id, l.nome]))
  const lojaDoCaixa: Record<string, string | null> = Object.fromEntries((caixasData ?? []).map(c => [c.id, c.loja_id]))
  const nomesPermitidos = permitidas.map(l => l.nome)
  const lojas = nomesPermitidos
  const lojaDaVenda: Record<string, string> = Object.fromEntries((vendasRaw ?? []).map(v => [v.id, v.caixa_id ? (nomeLoja[lojaDoCaixa[v.caixa_id] ?? ''] ?? '') : '']))

  // Nomes de clientes
  const pessoaIds = [...new Set((vendasRaw ?? []).map((v: { pessoa_id: string | null }) => v.pessoa_id).filter(Boolean))] as string[]
  let pessoaMap: Record<string, string> = {}
  if (pessoaIds.length > 0) {
    const pessoas = await fetchAllIn<{ id: string; nome: string }>(pessoaIds, (chunk, from, to) =>
      supabase.from('pessoas').select('id, nome').in('id', chunk).range(from, to))
    pessoaMap = Object.fromEntries(pessoas.map(p => [p.id, p.nome]))
  }

  // Formas de pagamento reais (tabela filha pagamentos_venda — suporta múltiplos pagamentos)
  const vendaIds = (vendasRaw ?? []).map((v: { id: string }) => v.id)
  const pagamentosMap: Record<string, string> = {}
  const pagamentosIds: Record<string, Set<string>> = {}
  if (vendaIds.length > 0) {
    const pags = await fetchAllIn<{ venda_id: string; forma_pagamento_id: string }>(vendaIds, (chunk, from, to) =>
      supabase.from('pagamentos_venda').select('venda_id, forma_pagamento_id').in('venda_id', chunk).range(from, to))
    const porVenda: Record<string, Set<string>> = {}
    for (const p of pags) {
      const nome = formaMap[p.forma_pagamento_id]
      if (!nome) continue
      ;(porVenda[p.venda_id] ||= new Set()).add(nome)
      ;(pagamentosIds[p.venda_id] ||= new Set()).add(p.forma_pagamento_id)
    }
    for (const [vid, set] of Object.entries(porVenda)) pagamentosMap[vid] = [...set].join(' + ')
  }

  const vendasBase = (vendasRaw ?? []).map((v: {
    id: string; numero: number | null; total: number; desconto: number
    created_at: string; status: string; vendedor_nome: string | null
    motivo_cancelamento?: string | null; observacoes?: string | null
    pessoa_id: string | null; forma_pagamento_id: string | null
  }) => ({
    id: v.id,
    numero: v.numero,
    total: v.total ?? 0,
    desconto: v.desconto ?? 0,
    created_at: v.created_at,
    status: v.status,
    motivo_cancelamento: v.motivo_cancelamento ?? null,
    observacoes: v.observacoes ?? null,
    vendedor_nome: v.vendedor_nome ?? null,
    pessoa_nome: v.pessoa_id ? (pessoaMap[v.pessoa_id] ?? null) : null,
    forma_pagamento_nome: pagamentosMap[v.id] ?? (v.forma_pagamento_id ? (formaMap[v.forma_pagamento_id] ?? null) : null),
    loja: lojaDaVenda[v.id] ?? '',
  })).filter((v) => {
    if (!vemTodas && v.loja && !nomesPermitidos.includes(v.loja)) return false
    if (loja && v.loja !== loja) return false
    if (forma && !(pagamentosIds[v.id]?.has(forma))) return false
    if (!busca) return true
    const b = busca.toLowerCase()
    return (
      v.pessoa_nome?.toLowerCase().includes(b) ||
      v.vendedor_nome?.toLowerCase().includes(b) ||
      String(v.numero).includes(b)
    )
  })

  // Vendedores da leva visível (pro filtro). Aplica o filtro de vendedor por último,
  // pra a lista do dropdown não sumir quando ela escolhe um. Pedido da Isa 29/07.
  const vendedores = [...new Set(vendasBase.map(v => v.vendedor_nome).filter(Boolean))].sort() as string[]
  const vendas = vendedor ? vendasBase.filter(v => v.vendedor_nome === vendedor) : vendasBase

  const concluidas = vendas.filter(v => v.status === 'concluida')
  const totalGeral = concluidas.reduce((s, v) => s + v.total, 0)
  const totalDesconto = concluidas.reduce((s, v) => s + v.desconto, 0)
  const ticketMedio = concluidas.length > 0 ? totalGeral / concluidas.length : 0
  const canceladas = vendas.filter(v => v.status === 'cancelada').length

  return (
    <VendasClient
      vendas={vendas}
      totalGeral={totalGeral}
      totalDesconto={totalDesconto}
      ticketMedio={ticketMedio}
      canceladas={canceladas}
      formas={formas}
      lojas={lojas}
      vendedores={vendedores}
      filtros={{ de: dataInicio, ate: dataFim, busca: busca ?? '', forma: forma ?? '', status: status ?? '', loja: loja ?? '', vendedor: vendedor ?? '' }}
    />
  )
}
