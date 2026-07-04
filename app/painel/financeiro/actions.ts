'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarLancamento(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const quitado = formData.getAll('quitado').includes('1')
  const valor = parseFloat((formData.get('valor') as string) || '0')
  const hoje = new Date().toISOString().slice(0, 10)
  const { error } = await supabase.from('lancamentos').insert({
    id: crypto.randomUUID(),
    descricao: formData.get('descricao') as string,
    valor,
    tipo: formData.get('tipo') as string,
    data_competencia: formData.get('data_competencia') as string,
    data_vencimento: formData.get('data_vencimento') as string,
    forma_pagamento: (formData.get('forma_pagamento') as string) || null,
    pessoa_nome: (formData.get('pessoa_nome') as string) || null,
    conta_id: (formData.get('conta_id') as string) || null,
    status: quitado ? 'pago' : 'pendente',
    data_pagamento: quitado ? hoje : null,
    valor_pago: quitado ? valor : 0,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
  redirect('/painel/financeiro')
}

export async function editarLancamento(id: string, formData: FormData) {
  await requirePermissao('financeiro')
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
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').update({
    status: 'pago',
    data_pagamento: new Date().toISOString().split('T')[0],
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
}

export async function deletarLancamento(id: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
}
