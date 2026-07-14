import { createServiceClient } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/lembretes'
import { LembretesClient } from './LembretesClient'

export default async function LembretesPage() {
  const supabase = await createServiceClient()
  const hoje = hojeSP().data

  const [lembretesRes, perfisRes, cargosRes, feitosRes] = await Promise.all([
    supabase.from('lembretes').select('*').order('hora'),
    supabase.from('perfis').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('cargos').select('id, nome').order('nome'),
    // últimos 7 dias — pra ver quem vem fazendo (e quem não)
    supabase.from('lembretes_feitos').select('lembrete_id, perfil_id, feito_em, data').gte('data', hoje),
  ])

  return (
    <LembretesClient
      lembretes={lembretesRes.data ?? []}
      perfis={perfisRes.data ?? []}
      cargos={cargosRes.data ?? []}
      feitosHoje={feitosRes.data ?? []}
    />
  )
}
