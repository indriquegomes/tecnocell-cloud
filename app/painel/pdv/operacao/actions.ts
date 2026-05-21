'use server'

import { createServiceClient, createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function abrirCaixa(formData: FormData) {
  const supabase = await createServiceClient()
  const clientSupabase = await createClient()
  const { data: { session } } = await clientSupabase.auth.getSession()

  const { error } = await supabase.from('caixas').insert({
    valor_abertura: parseFloat(formData.get('valor_abertura') as string) || 0,
    obs_abertura: (formData.get('obs_abertura') as string) || null,
    usuario_id: session?.user?.id ?? null,
    status: 'aberto',
  })
  if (error) redirect(`/painel/pdv/operacao?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/pdv/operacao')
  redirect('/painel/pdv/operacao')
}

export async function fecharCaixa(id: string, formData: FormData) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('caixas').update({
    status: 'fechado',
    valor_fechamento: parseFloat(formData.get('valor_fechamento') as string) || 0,
    obs_fechamento: (formData.get('obs_fechamento') as string) || null,
    fechado_em: new Date().toISOString(),
  }).eq('id', id)
  if (error) redirect(`/painel/pdv/operacao?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/pdv/operacao')
  redirect('/painel/pdv/operacao')
}
