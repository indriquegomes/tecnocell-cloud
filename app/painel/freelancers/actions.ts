'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hojeSP } from '@/lib/utils'

// Paga o freelancer (horas x valor) e zera o banco dele (marca os pontos como pagos).
export async function pagarFreelancer(formData: FormData) {
  await requirePermissao('rh')
  const supabase = await createServiceClient()
  const perfilId = formData.get('perfil_id') as string
  const nome = (formData.get('nome') as string) || 'Freelancer'
  const horas = (formData.get('horas') as string) || '0'
  const valor = Math.max(0, parseFloat((formData.get('valor') as string) || '0') || 0)

  if (!perfilId || valor <= 0.01) redirect('/painel/freelancers?erro=' + encodeURIComponent('Sem horas pra pagar.'))

  const hoje = hojeSP()
  const { error: e1 } = await supabase.from('lancamentos').insert({
    tipo: 'pagar', status: 'pago',
    pessoa_nome: nome, valor,
    data_vencimento: hoje, data_pagamento: hoje,
    categoria: 'Freelancer', descricao: 'Freelancer — ' + horas + 'h',
  })
  if (e1) redirect('/painel/freelancers?erro=' + encodeURIComponent(e1.message))

  const { error: e2 } = await supabase.from('pontos').update({ pago_em: new Date().toISOString() }).eq('usuario_id', perfilId).is('pago_em', null)
  if (e2) redirect('/painel/freelancers?erro=' + encodeURIComponent(e2.message))

  revalidatePath('/painel/freelancers')
  redirect('/painel/freelancers')
}
