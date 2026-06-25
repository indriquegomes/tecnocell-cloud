import { createServiceClient } from '@/lib/supabase/server'
import { DevolucoesClient } from './DevolucoesClient'
import type { DevolucaoResumo } from './actions'

export default async function DevolucoesPage() {
  const supabase = await createServiceClient()

  const { data } = await supabase
    .from('devolucoes')
    .select('id, venda_id, pessoa_nome, vendedor_nome, valor_total, tipo_credito, motivo, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return <DevolucoesClient devolucoes={(data ?? []) as DevolucaoResumo[]} />
}
