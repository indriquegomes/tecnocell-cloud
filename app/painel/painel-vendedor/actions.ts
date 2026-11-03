'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

// Total VENDIDO da funcionária logada no mês — a régua do velocímetro
// individual (Percentual = vendido / meta). Re-deriva o usuário do header
// x-user-id, então ninguém enxerga a venda de outra pessoa.
export async function buscarMinhaVenda(): Promise<number> {
  const supabase = await createServiceClient()
  const userId = (await headers()).get('x-user-id')
  if (!userId) return 0
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const { data } = await supabase.from('vendas')
    .select('total')
    .eq('vendedor_id', userId).eq('status', 'concluida').eq('uso_interno', false)
    .gte('created_at', inicioMes + 'T00:00:00-03:00')
  return (data ?? []).reduce((s, v) => s + (Number(v.total) || 0), 0)
}
