'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function desconectarMercadoLivre() {
  await requirePermissao('integracoes')
  const supabase = await createServiceClient()
  await supabase.from('integracoes_mercado_livre').delete().eq('id', 'principal')
  revalidatePath('/painel/integracoes')
  revalidatePath('/painel/integracoes/lojas')
}
