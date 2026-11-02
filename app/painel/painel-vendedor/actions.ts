'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { headers } from 'next/headers'

// Total de PAGAMENTO REAL (dinheiro/PIX/cartão, status 'pago') da loja ATIVA da
// vendedora no período. A loja vem do cookie tc_loja_ativa (não confia no que o
// cliente manda), então a vendedora nunca enxerga a meta de outra loja.
export async function buscarMetaPago(de: string, ate: string): Promise<number> {
  const supabase = await createServiceClient()
  const { ativa } = await lojasDoUsuario().catch(() => ({ ativa: null }))
  const lojaId = ativa?.id ?? null
  if (!lojaId) return 0

  const { data } = await supabase.rpc('dashboard_meta_pago', { p_de: de, p_ate: ate })
  const rows = (data ?? []) as { loja_id: string; valor: number }[]
  return rows
    .filter((r) => r.loja_id === lojaId)
    .reduce((s, r) => s + (Number(r.valor) || 0), 0)
}

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
