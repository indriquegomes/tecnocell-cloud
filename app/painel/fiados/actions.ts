'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Edita a chave Pix da conta direto da tela de Fiados, sem ir nas Contas.
// Só mexe em chave_pix e titular — o resto da conta fica intocado.
export async function atualizarChavePix(contaId: string, chave: string, titular: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas')
    .update({ chave_pix: chave.trim() || null, titular: titular.trim() || null })
    .eq('id', contaId)
  if (error) return { erro: error.message }
  revalidatePath('/painel/fiados')
  revalidatePath('/painel/contas')
  return { ok: true as const }
}
