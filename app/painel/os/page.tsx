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

  const [{ data }, { data: tecnicosData }, { data: modelosData }] = await Promise.all([
    supabase
      .from('ordens_servico')
      .select('id, numero, pessoa_nome, pessoa_id, aparelho, modelo, imei, problema, observacoes, status, total, tecnico_nome, previsao_entrega, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('perfis').select('id, nome').not('nome', 'is', null).order('nome'),
    supabase.from('checklists_modelo').select('id, nome').eq('ativo', true).order('nome'),
  ])
  const tecnicos = (tecnicosData ?? []) as { id: string; nome: string }[]
  const modelosChecklist = (modelosData ?? []) as { id: string; nome: string }[]

  const ordens: OrdemServico[] = (data ?? []).map((o) => ({
    id:           o.id,
    numero:       o.numero,
    pessoa_nome:  o.pessoa_nome ?? null,
    pessoa_id:    o.pessoa_id ?? null,
    aparelho:     o.aparelho ?? null,
    modelo:       o.modelo ?? null,
    imei:         o.imei ?? null,
    problema:     o.problema ?? '',
    observacoes:  o.observacoes ?? null,
    status:       o.status as OrdemServico['status'],
    total:        o.total ?? 0,
    tecnico_nome: o.tecnico_nome ?? null,
    previsao_entrega: o.previsao_entrega ?? null,
    created_at:   o.created_at,
  }))

  return (
    <OSClient
      ordens={ordens}
      tecnicos={tecnicos}
      modelosChecklist={modelosChecklist}
      filtros={{ q: q ?? '', status: status ?? '' }}
    />
  )
}
