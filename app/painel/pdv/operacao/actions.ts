'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function abrirCaixa(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('caixas').insert({
    valor_abertura: parseFloat(formData.get('valor_abertura') as string) || 0,
    obs_abertura: (formData.get('obs_abertura') as string) || null,
    status: 'aberto',
  })
  revalidatePath('/painel/pdv/operacao')
}

export async function fecharCaixa(id: string, formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('caixas').update({
    status: 'fechado',
    valor_fechamento: parseFloat(formData.get('valor_fechamento') as string) || 0,
    obs_fechamento: (formData.get('obs_fechamento') as string) || null,
    fechado_em: new Date().toISOString(),
  }).eq('id', id)
  revalidatePath('/painel/pdv/operacao')
}

export async function registrarReforco(caixaId: string, formData: FormData) {
  await requireAuth()
  const valor = parseFloat(formData.get('valor') as string) || 0
  if (valor <= 0) return
  const supabase = await createServiceClient()
  await supabase.from('movimentos_caixa').insert({
    caixa_id: caixaId,
    tipo: 'reforco',
    motivo: (formData.get('motivo') as string) || null,
    forma_pagamento: (formData.get('forma_pagamento') as string) || 'Dinheiro',
    valor,
  })
  revalidatePath('/painel/pdv/operacao')
}

export async function registrarRetirada(caixaId: string, formData: FormData) {
  await requireAuth()
  const valor = parseFloat(formData.get('valor') as string) || 0
  if (valor <= 0) return
  const supabase = await createServiceClient()
  await supabase.from('movimentos_caixa').insert({
    caixa_id: caixaId,
    tipo: 'retirada',
    motivo: (formData.get('motivo') as string) || null,
    forma_pagamento: (formData.get('forma_pagamento') as string) || 'Dinheiro',
    valor,
  })
  revalidatePath('/painel/pdv/operacao')
}
