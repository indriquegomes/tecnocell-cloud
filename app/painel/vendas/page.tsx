import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { VendasClient } from './VendasClient'

export default async function PainelVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; busca?: string; forma?: string; status?: string }>
}) {
  const { de, ate, busca, forma, status } = await searchParams
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
    pessoa_id: string | null; forma_pagamento_id: string | null
  }
  const [vendasRaw, { data: formasData }] = await Promise.all([
    fetchAll<VendaRow>((from, to) => {
      let q = supabase
        .from('vendas')
        .select('id, numero, total, desconto, created_at, status, vendedor_nome, pessoa_id, forma_pagamento_id')
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

  const vendas = (vendasRaw ?? []).map((v: {
    id: string; numero: number | null; total: number; desconto: number
    created_at: string; status: string; vendedor_nome: string | null
    pessoa_id: string | null; forma_pagamento_id: string | null
  }) => ({
    id: v.id,
    numero: v.numero,
    total: v.total ?? 0,
    desconto: v.desconto ?? 0,
    created_at: v.created_at,
    status: v.status,
    vendedor_nome: v.vendedor_nome ?? null,
    pessoa_nome: v.pessoa_id ? (pessoaMap[v.pessoa_id] ?? null) : null,
    forma_pagamento_nome: pagamentosMap[v.id] ?? (v.forma_pagamento_id ? (formaMap[v.forma_pagamento_id] ?? null) : null),
  })).filter((v) => {
    if (forma && !(pagamentosIds[v.id]?.has(forma))) return false
    if (!busca) return true
    const b = busca.toLowerCase()
    return (
      v.pessoa_nome?.toLowerCase().includes(b) ||
      v.vendedor_nome?.toLowerCase().includes(b) ||
      String(v.numero).includes(b)
    )
  })

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
      filtros={{ de: dataInicio, ate: dataFim, busca: busca ?? '', forma: forma ?? '', status: status ?? '' }}
    />
  )
}
