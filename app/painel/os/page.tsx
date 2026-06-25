import { createServiceClient } from '@/lib/supabase/server'
import { OSClient } from './OSClient'
import type { OrdemServico } from './actions'

export default async function OSPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q, status } = await searchParams
  const supabase = await createServiceClient()

  const { data } = await supabase
    .from('ordens_servico')
    .select(`id, numero, pessoa_nome, pessoa_id, equipamento, marca, modelo,
      numero_serie, defeito_relatado, observacoes, status, total, tecnico_nome, created_at,
      itens_os(id)`)
    .order('created_at', { ascending: false })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordens: OrdemServico[] = (data ?? []).map((o: any) => ({
    ...o,
    pessoa_id:    o.pessoa_id    ?? null,
    numero_serie: o.numero_serie ?? null,
    observacoes:  o.observacoes  ?? null,
    itens_count:  (o.itens_os ?? []).length,
  }))

  return (
    <OSClient
      ordens={ordens}
      filtros={{ q: q ?? '', status: status ?? '' }}
    />
  )
}
