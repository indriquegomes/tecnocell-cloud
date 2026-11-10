'use server'

import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { hojeSP } from '@/lib/utils'

// FATURAMENTO DA LOJA no mês — a régua do velocímetro, que agora é a meta da loja
// (a meta não é individual). A loja vem do perfil de quem está logado; sem loja
// definida devolve 0 e o velocímetro segue com o número que veio do servidor.
// fetchAll porque um mês de loja passa de 1.000 vendas e o PostgREST corta.
export async function buscarFaturamentoDaLoja(): Promise<number> {
  const supabase = await createServiceClient()
  const userId = (await headers()).get('x-user-id')
  if (!userId) return 0

  const { data: perfil } = await supabase.from('perfis').select('pdv_loja_id').eq('id', userId).maybeSingle()
  const lojaId = (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null
  if (!lojaId) return 0

  const { data: deps } = await supabase.from('depositos').select('id').eq('loja_id', lojaId)
  const ids = ((deps ?? []) as { id: string }[]).map((d) => d.id)
  if (!ids.length) return 0

  const inicioMes = hojeSP().slice(0, 8) + '01'
  const vendas = await fetchAll<{ total: number | null }>((from, to) =>
    supabase.from('vendas').select('total')
      .in('deposito_id', ids).eq('status', 'concluida').eq('uso_interno', false)
      .gte('created_at', inicioMes + 'T00:00:00-03:00').range(from, to))
  return vendas.reduce((s, v) => s + (Number(v.total) || 0), 0)
}
