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

// Nota de cobrança rápida do cliente (ex.: "é devolução, não cobrar").
// Some sozinha quando o cliente zera a dívida (trigger limpar_obs_cobranca).
export async function salvarObsCobranca(pessoaId: string, nota: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pessoas')
    .update({ obs_cobranca: nota.trim() || null })
    .eq('id', pessoaId)
  if (error) return { erro: error.message }
  revalidatePath('/painel/fiados')
  return { ok: true as const }
}
