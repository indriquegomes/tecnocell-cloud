'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'

// Total de PAGAMENTO REAL (dinheiro/PIX/cartão, status 'pago') da loja ATIVA da
// vendedora no período — a régua do velocímetro. A loja vem do cookie
// tc_loja_ativa (não confia no que o cliente manda), então a vendedora nunca
// enxerga a meta de outra loja.
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
