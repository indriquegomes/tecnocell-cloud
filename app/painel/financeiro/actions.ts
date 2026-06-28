'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarLancamento(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').insert({
    id: crypto.randomUUID(),
    descricao: formData.get('descricao') as string,
    valor: parseFloat((formData.get('valor') as string) || '0'),
    tipo: formData.get('tipo') as string,
    data_competencia: formData.get('data_competencia') as string,
    data_vencimento: formData.get('data_vencimento') as string,
    forma_pagamento: (formData.get('forma_pagamento') as string) || null,
    pessoa_nome: (formData.get('pessoa_nome') as string) || null,
    status: 'pendente',
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
  redirect('/painel/financeiro')
}

export async function editarLancamento(id: string, formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').update({
    descricao: formData.get('descricao') as string,
    valor: parseFloat((formData.get('valor') as string) || '0'),
    tipo: formData.get('tipo') as string,
    data_competencia: formData.get('data_competencia') as string,
    data_vencimento: formData.get('data_vencimento') as string,
    forma_pagamento: (formData.get('forma_pagamento') as string) || null,
    pessoa_nome: (formData.get('pessoa_nome') as string) || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
  redirect('/painel/financeiro')
}

export async function marcarPago(id: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').update({
    status: 'pago',
    data_pagamento: new Date().toISOString().split('T')[0],
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
}

export async function deletarLancamento(id: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
}
