'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Estado = { erro?: string; ok?: boolean }

// Alterna fechado/reaberto (lê 'fechado' do form). Guarda em configuracoes — sem travar nada.
export async function alternarFechamento(prev: Estado | null, formData: FormData): Promise<Estado> {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const mes = (formData.get('mes') as string) || ''
  const fechado = formData.get('fechado') === '1'
  if (!/^\d{4}-\d{2}$/.test(mes)) return { erro: 'Mês inválido.' }
  if (fechado) {
    await supabase.from('configuracoes').delete().eq('chave', `fechamento_mes:${mes}`)
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('configuracoes').upsert({
      chave: `fechamento_mes:${mes}`,
      valor: { fechado_em: new Date().toISOString(), fechado_por: user?.email ?? user?.id ?? '—' },
    }, { onConflict: 'chave' })
  }
  revalidatePath('/painel/fechamento-mes')
  return { ok: true }
}
