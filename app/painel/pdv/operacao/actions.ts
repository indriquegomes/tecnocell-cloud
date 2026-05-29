'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function abrirCaixa(formData: FormData) {
  const supabase = await createServiceClient()
  await supabase.from('caixas').insert({
    valor_abertura: parseFloat(formData.get('valor_abertura') as string) || 0,
    obs_abertura: (formData.get('obs_abertura') as string) || null,
    status: 'aberto',
  })
  revalidatePath('/painel/pdv/operacao')
}

export async function fecharCaixa(id: string, formData: FormData) {
  const supabase = await createServiceClient()
  await supabase.from('caixas').update({
    status: 'fechado',
    valor_fechamento: parseFloat(formData.get('valor_fechamento') as string) || 0,
    obs_fechamento: (formData.get('obs_fechamento') as string) || null,
    fechado_em: new Date().toISOString(),
  }).eq('id', id)
  revalidatePath('/painel/pdv/operacao')
}
