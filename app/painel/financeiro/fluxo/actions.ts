'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Salva a config do planejamento tributário (categorias fixas + margem).
export async function salvarPlanejamento(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const categorias = ((formData.get('categorias') as string) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const margem = Math.max(0, Math.min(100, parseFloat((formData.get('margem') as string) || '10') || 10))
  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave: 'planejamento', valor: { categoriasFixas: categorias, margem } }, { onConflict: 'chave' })
  if (error) redirect('/painel/financeiro/fluxo?erro=' + encodeURIComponent(error.message))
  revalidatePath('/painel/financeiro/fluxo')
  redirect('/painel/financeiro/fluxo')
}
