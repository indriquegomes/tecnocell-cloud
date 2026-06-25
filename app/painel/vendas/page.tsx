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

  let query = supabase
    .from('vendas')
    .select(`
      id, total, desconto, created_at, status,
      vendedor_nome, pessoa_nome,
      deposito:depositos(id, nome),
      forma_pagamento:formas_pagamento(id, nome)
    `)
    .eq('status', 'concluida')
    .gte('created_at', dataInicio + 'T00:00:00')
    .lte('created_at', dataFim + 'T23:59:59')
    .order('created_at', { ascending: false })
    .limit(500)

  if (deposito) query = query.eq('deposito_id', deposito)
  if (forma) query = query.eq('forma_pagamento_id', forma)

  const { data: vendasRaw } = await query

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendasFiltered = (vendasRaw ?? []).filter((v: any) => {
    if (!busca) return true
    const b = busca.toLowerCase()
    return (
      v.pessoa_nome?.toLowerCase().includes(b) ||
      v.vendedor_nome?.toLowerCase().includes(b)
    )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any[]

  const vendas = vendasFiltered as {
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

  const totalGeral = vendas.reduce((s, v) => s + (v.total ?? 0), 0)
  const totalDesconto = vendas.reduce((s, v) => s + (v.desconto ?? 0), 0)
  const ticketMedio = vendas.length > 0 ? totalGeral / vendas.length : 0

  const [{ data: depositos }, { data: formas }] = await Promise.all([
    supabase.from('depositos').select('id, nome').order('nome'),
    supabase.from('formas_pagamento').select('id, nome').order('nome'),
  ])

  return (
    <VendasClient
      vendas={vendas}
      totalGeral={totalGeral}
      totalDesconto={totalDesconto}
      ticketMedio={ticketMedio}
      depositos={(depositos ?? []) as { id: string; nome: string }[]}
      formas={(formas ?? []) as { id: string; nome: string }[]}
      filtros={{ de: dataInicio, ate: dataFim, busca: busca ?? '', deposito: deposito ?? '', forma: forma ?? '' }}
    />
  )
}
