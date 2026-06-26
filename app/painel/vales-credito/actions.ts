'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function emitirCredito(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()

  const pessoa_id = formData.get('pessoa_id') as string
  const valor = parseFloat(formData.get('valor') as string) || 0
  const descricao = (formData.get('descricao') as string).trim() || 'Crédito emitido'

  if (!pessoa_id) redirect(`/painel/vales-credito?erro=${encodeURIComponent('Selecione um cliente.')}`)
  if (valor <= 0) redirect(`/painel/vales-credito?erro=${encodeURIComponent('Valor deve ser maior que zero.')}`)

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('nome')
    .eq('id', pessoa_id)
    .maybeSingle()

  const { error } = await supabase.from('creditos_clientes').insert({
    pessoa_id,
    pessoa_nome: pessoa?.nome ?? 'Cliente',
    valor,
    tipo: 'credito',
    descricao,
  })

  if (error) redirect(`/painel/vales-credito?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/vales-credito')
  redirect('/painel/vales-credito?ok=1')
}

export async function estornarCredito(id: string) {
  await requireAuth()
  const supabase = await createServiceClient()

  const { data: lanc } = await supabase
    .from('creditos_clientes')
    .select('pessoa_id, pessoa_nome, valor, tipo')
    .eq('id', id)
    .maybeSingle()

  if (!lanc || lanc.tipo !== 'credito') return

  const { error } = await supabase.from('creditos_clientes').insert({
    pessoa_id: lanc.pessoa_id,
    pessoa_nome: lanc.pessoa_nome,
    valor: lanc.valor,
    tipo: 'estorno',
    descricao: 'Estorno de crédito',
  })
  if (error) redirect(`/painel/vales-credito?erro=${encodeURIComponent(error.message)}`)

  revalidatePath('/painel/vales-credito')
  redirect('/painel/vales-credito')
}
