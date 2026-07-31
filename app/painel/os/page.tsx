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

  const [{ data }, { data: tecnicosData }, { data: modelosData }, { data: lojasData }, { data: formasData }] = await Promise.all([
    supabase
      .from('ordens_servico')
      .select('id, numero, pessoa_nome, pessoa_id, aparelho:equipamento, modelo, imei:serial_imei, problema:defeito_relatado, observacoes, status, total, custo, tecnico_nome, previsao_entrega, recebido_em, forma_recebimento, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('perfis').select('id, nome').not('nome', 'is', null).order('nome'),
    supabase.from('checklists_modelo').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('lojas').select('id, nome').order('nome'),
    supabase.from('formas_pagamento').select('nome').eq('ativo', true).neq('tipo', 'fiado').order('nome'),
  ])
  const tecnicos = (tecnicosData ?? []) as { id: string; nome: string }[]
  const modelosChecklist = (modelosData ?? []) as { id: string; nome: string }[]
  const lojas = (lojasData ?? []) as { id: string; nome: string }[]
  const formasReceb = ((formasData ?? []) as { nome: string }[]).map((f) => f.nome)

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
    custo:        o.custo ?? 0,
    tecnico_nome: o.tecnico_nome ?? null,
    previsao_entrega: o.previsao_entrega ?? null,
    recebido_em:  o.recebido_em ?? null,
    forma_recebimento: o.forma_recebimento ?? null,
    created_at:   o.created_at,
  }))

  return (
    <OSClient
      ordens={ordens}
      tecnicos={tecnicos}
      modelosChecklist={modelosChecklist}
      lojas={lojas}
      formasReceb={formasReceb}
      filtros={{ q: q ?? '', status: status ?? '' }}
    />
  )
}
