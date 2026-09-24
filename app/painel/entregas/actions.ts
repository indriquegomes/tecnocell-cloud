'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Marca a entrega como feita (motoboy entregou). Grava quem entregou + a hora.
export async function marcarEntregue(formData: FormData) {
  await requirePermissao('pdv')
  const supabase = await createServiceClient()
  const vendaId = (formData.get('venda_id') as string) || ''
  const motoboy = ((formData.get('motoboy') as string) || '').trim() || null
  if (!vendaId) return
  const { error } = await supabase.from('vendas').update({
    entregue_em: new Date().toISOString(),
    entregue_por: motoboy,
  }).eq('id', vendaId)
  if (error) console.error('marcarEntregue:', error.message)
  revalidatePath('/painel/entregas')
}
