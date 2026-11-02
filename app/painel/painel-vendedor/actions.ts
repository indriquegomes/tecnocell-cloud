'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

// Total de PAGAMENTO REAL (dinheiro/PIX/cartão, status 'pago') da loja da
// vendedora no período — a régua do velocímetro. Re-deriva a loja do perfil
// (não confia no que o cliente manda), então a vendedora nunca enxerga a
// meta de outra loja.
export async function buscarMetaPago(de: string, ate: string): Promise<number> {
  const supabase = await createServiceClient()
  const userId = (await headers()).get('x-user-id')
  const { data: perfil } = userId
    ? await supabase.from('perfis').select('pdv_loja_id').eq('id', userId).maybeSingle()
    : { data: null }
  const lojaId = (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null
  if (!lojaId) return 0

  const { data } = await supabase.rpc('dashboard_meta_pago', { p_de: de, p_ate: ate })
  const rows = (data ?? []) as { loja_id: string; valor: number }[]
  return rows
    .filter((r) => r.loja_id === lojaId)
    .reduce((s, r) => s + (Number(r.valor) || 0), 0)
}
