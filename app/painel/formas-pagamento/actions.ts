'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { tipoUsaMaquina } from '@/lib/formas-pagamento'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function campos(formData: FormData) {
  const tipo = (formData.get('tipo') as string) || 'outro'
  // máquina só faz sentido em cartão; nos outros tipos zera pra não deixar lixo
  const maquina_id = tipoUsaMaquina(tipo) ? ((formData.get('maquina_id') as string) || null) : null
  // fiado não traz dinheiro (vira 'a receber'), então nunca tem conta destino
  const conta_destino_id = tipo === 'fiado' ? null : ((formData.get('conta_destino_id') as string) || null)
  return {
    nome: formData.get('nome') as string,
    tipo,
    maquina_id,
    prazo_recebimento: (formData.get('prazo_recebimento') as string) || 'a_vista',
    conta_destino_id,
    loja_id: (formData.get('loja_id') as string) || null,
  }
}

export async function criarFormaPagamento(formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('formas_pagamento').insert({
    id: crypto.randomUUID(),
    ...campos(formData),
    ativo: true,
  })
  if (error) redirect(`/painel/formas-pagamento?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/formas-pagamento')
  revalidatePath('/painel/pdv')
  redirect('/painel/formas-pagamento')
}

export async function editarFormaPagamento(id: string, formData: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('formas_pagamento').update({
    ...campos(formData),
    ativo: formData.get('ativo') === 'true',
  }).eq('id', id)
  if (error) redirect(`/painel/formas-pagamento?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/formas-pagamento')
  revalidatePath('/painel/pdv')
  redirect('/painel/formas-pagamento')
}

export async function deletarFormaPagamento(id: string) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('formas_pagamento').delete().eq('id', id)
  // redirect (não throw): chamado pelo BotaoExcluir, que é um <form
  // action={...}> por baixo — throw derruba a tela inteira em vez de mostrar
  // o motivo (achado do mesmo bug em produtos/financeiro, 26/08).
  if (error) redirect(`/painel/formas-pagamento?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/formas-pagamento')
}
