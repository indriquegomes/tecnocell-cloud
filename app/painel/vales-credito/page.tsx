import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { CreditosClient } from './CreditosClient'

export default async function CreditosClientePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; erro?: string; ok?: string }>
}) {
  const { cliente: clienteFiltro, erro, ok } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: movimentos }, pessoas] = await Promise.all([
    supabase
      .from('creditos_clientes')
      .select('id, pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, created_at')
      .order('created_at', { ascending: false }),
    fetchAll((from, to) => supabase.from('pessoas').select('id, nome').in('tipo', ['cliente', 'ambos']).order('nome').range(from, to)),
  ])

  // Busca detalhes das devoluções referenciadas
  const devolucaoIds = [...new Set(
    (movimentos ?? []).map((m) => m.devolucao_id).filter(Boolean) as string[]
  )]

  const detalhesDevolucao: Record<string, {
    vendaNumero: number | null
    motivo: string | null
    itens: { nome: string; quantidade: number; preco_unitario: number }[]
  }> = {}

  if (devolucaoIds.length > 0) {
    const [{ data: devs }, { data: itens }] = await Promise.all([
      supabase.from('devolucoes').select('id, venda_id, motivo').in('id', devolucaoIds),
      supabase.from('itens_devolucao').select('devolucao_id, nome, quantidade, preco_unitario').in('devolucao_id', devolucaoIds),
    ])

    const vendaIds = (devs ?? []).map((d) => d.venda_id).filter(Boolean) as string[]
    const { data: vendas } = vendaIds.length > 0
      ? await supabase.from('vendas').select('id, numero').in('id', vendaIds)
      : { data: [] }

    const vendaNumeroMap = Object.fromEntries((vendas ?? []).map((v) => [v.id, v.numero]))

    for (const d of devs ?? []) {
      detalhesDevolucao[d.id] = {
        vendaNumero: d.venda_id ? (vendaNumeroMap[d.venda_id] ?? null) : null,
        motivo: d.motivo ?? null,
        itens: (itens ?? [])
          .filter((i) => i.devolucao_id === d.id)
          .map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario })),
      }
    }
  }

  // Agrupa por pessoa e calcula saldo
  type Mov = NonNullable<typeof movimentos>[number]
  const mapaPessoa: Record<string, {
    id: string
    nome: string
    saldo: number
    movimentos: Mov[]
  }> = {}

  for (const m of movimentos ?? []) {
    if (!m.pessoa_id) continue
    if (!mapaPessoa[m.pessoa_id]) {
      mapaPessoa[m.pessoa_id] = { id: m.pessoa_id, nome: m.pessoa_nome ?? '—', saldo: 0, movimentos: [] }
    }
    // 'uso' e 'estorno' saem (−); 'credito' entra (+). Estorno cancela um crédito.
    if (m.tipo === 'uso' || m.tipo === 'estorno') mapaPessoa[m.pessoa_id].saldo -= m.valor ?? 0
    else mapaPessoa[m.pessoa_id].saldo += m.valor ?? 0
    mapaPessoa[m.pessoa_id].movimentos.push(m)
  }

  const clientes = Object.values(mapaPessoa)
    .filter((c) => c.saldo > 0.01 || c.movimentos.some((m) => m.tipo !== 'uso'))
    .sort((a, b) => b.saldo - a.saldo)

  const totalEmCirculacao = clientes.reduce((s, c) => s + Math.max(0, c.saldo), 0)

  return (
    <CreditosClient
      clientes={clientes}
      pessoas={pessoas ?? []}
      totalEmCirculacao={totalEmCirculacao}
      clienteFiltroInicial={clienteFiltro ?? ''}
      detalhesDevolucao={detalhesDevolucao}
      erro={erro}
      ok={ok}
    />
  )
}
