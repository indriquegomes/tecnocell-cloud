import { createServiceClient } from '@/lib/supabase/server'
import { CreditosClient } from './CreditosClient'

export default async function CreditosClientePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; erro?: string; ok?: string }>
}) {
  const { cliente: clienteFiltro, erro, ok } = await searchParams
  const supabase = await createServiceClient()

  const [{ data: movimentos }, { data: pessoas }] = await Promise.all([
    supabase
      .from('creditos_clientes')
      .select('id, pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('pessoas').select('id, nome').in('tipo', ['cliente', 'ambos']).order('nome'),
  ])

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
    if (m.tipo === 'uso') mapaPessoa[m.pessoa_id].saldo -= m.valor ?? 0
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
      erro={erro}
      ok={ok}
    />
  )
}
