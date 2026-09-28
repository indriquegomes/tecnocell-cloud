'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Motoboy registra uma rota do dia (ou admin registra por ele).
export async function registrarRota(formData: FormData) {
  await requirePermissao('motoboy')
  const supabase = await createServiceClient()
  const perfilId = (formData.get('perfil_id') as string) || null
  const data = formData.get('data') as string
  const lojaId = (formData.get('loja_id') as string) || null
  const entregas = Math.max(0, parseInt((formData.get('entregas') as string) || '0', 10) || 0)
  const extras = Math.max(0, parseInt((formData.get('extras') as string) || '0', 10) || 0)
  const obs = ((formData.get('observacao') as string) || '').trim() || null
  if (!perfilId || !data) redirect('/painel/motoboy?erro=' + encodeURIComponent('Preencha motoboy e data'))
  const { error } = await supabase.from('rotas_motoboy').insert({
    perfil_id: perfilId, data, loja_id: lojaId, entregas, extras, observacao: obs,
  })
  if (error) redirect('/painel/motoboy?erro=' + encodeURIComponent(error.message))
  revalidatePath('/painel/motoboy')
  redirect('/painel/motoboy')
}
