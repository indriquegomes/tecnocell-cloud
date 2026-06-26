import { createServiceClient } from '@/lib/supabase/server'
import { VendasClient } from './VendasClient'

export default async function PainelVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; busca?: string; deposito?: string; forma?: string }>
}) {
  const { de, ate, busca, deposito, forma } = await searchParams
  const supabase = await createServiceClient()

  const hoje = new Date().toISOString().split('T')[0]
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dataInicio = de ?? inicioMes
  const dataFim = ate ?? hoje

  // Sem FK joins — tabela vendas pode não ter constraints definidas no PostgREST
  let query = supabase
    .from('vendas')
    .select('id, total, desconto, created_at, status, vendedor_nome, pessoa_id, deposito_id, forma_pagamento_id')
    .eq('status', 'concluida')
    .gte('created_at', dataInicio + 'T00:00:00')
    .lte('created_at', dataFim + 'T23:59:59')
    .order('created_at', { ascending: false })
    .limit(500)

  if (deposito) query = query.eq('deposito_id', deposito)
  if (forma) query = query.eq('forma_pagamento_id', forma)

  const [{ data: vendasRaw }, { data: depositosData }, { data: formasData }] = await Promise.all([
    query,
    supabase.from('depositos').select('id, nome').order('nome'),
    supabase.from('formas_pagamento').select('id, nome').order('nome'),
  ])

  const depositos = (depositosData ?? []) as { id: string; nome: string }[]
  const formas = (formasData ?? []) as { id: string; nome: string }[]

  const depositoMap = Object.fromEntries(depositos.map(d => [d.id, d.nome]))
  const formaMap = Object.fromEntries(formas.map(f => [f.id, f.nome]))

  // Nomes de clientes — busca só os IDs que aparecem nas vendas do período
  const pessoaIds = [...new Set((vendasRaw ?? []).map(v => v.pessoa_id).filter(Boolean))] as string[]
  let pessoaMap: Record<string, string> = {}
  if (pessoaIds.length > 0) {
    const { data: pessoas } = await supabase.from('pessoas').select('id, nome').in('id', pessoaIds)
    pessoaMap = Object.fromEntries((pessoas ?? []).map(p => [p.id, p.nome]))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendas = (vendasRaw ?? []).map((v: any) => ({
    id: v.id as string,
    total: (v.total as number) ?? 0,
    desconto: (v.desconto as number) ?? 0,
    created_at: v.created_at as string,
    status: v.status as string,
    vendedor_nome: (v.vendedor_nome as string | null) ?? null,
    pessoa_nome: (v.pessoa_id ? pessoaMap[v.pessoa_id] : null) ?? (v.vendedor_nome as string | null) ?? null,
    deposito: v.deposito_id
      ? { id: v.deposito_id as string, nome: depositoMap[v.deposito_id] ?? (v.deposito_id as string) }
      : null,
    forma_pagamento: v.forma_pagamento_id
      ? { id: v.forma_pagamento_id as string, nome: formaMap[v.forma_pagamento_id] ?? (v.forma_pagamento_id as string) }
      : null,
  })).filter((v: { pessoa_nome: string | null; vendedor_nome: string | null }) => {
    if (!busca) return true
    const b = busca.toLowerCase()
    return (
      v.pessoa_nome?.toLowerCase().includes(b) ||
      v.vendedor_nome?.toLowerCase().includes(b)
    )
  }) as {
    id: string
    total: number
    desconto: number
    created_at: string
    status: string
    vendedor_nome: string | null
    pessoa_nome: string | null
    deposito: { id: string; nome: string } | null
    forma_pagamento: { id: string; nome: string } | null
  }[]

  const totalGeral = vendas.reduce((s, v) => s + v.total, 0)
  const totalDesconto = vendas.reduce((s, v) => s + v.desconto, 0)
  const ticketMedio = vendas.length > 0 ? totalGeral / vendas.length : 0

  return (
    <VendasClient
      vendas={vendas}
      totalGeral={totalGeral}
      totalDesconto={totalDesconto}
      ticketMedio={ticketMedio}
      depositos={depositos}
      formas={formas}
      filtros={{ de: dataInicio, ate: dataFim, busca: busca ?? '', deposito: deposito ?? '', forma: forma ?? '' }}
    />
  )
}
