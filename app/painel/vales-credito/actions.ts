'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function emitirCredito(formData: FormData) {
  await requirePermissao('financeiro')
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
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  const { data: lanc, error: erroLanc } = await supabase
    .from('creditos_clientes')
    .select('pessoa_id, pessoa_nome, valor, tipo')
    .eq('id', id)
    .maybeSingle()
  if (erroLanc) redirect(`/painel/vales-credito?erro=${encodeURIComponent(erroLanc.message)}`)

  if (!lanc || lanc.tipo !== 'credito') return

  // Idempotente: estornar 2x criaria 2 linhas de 'estorno' e jogaria o saldo
  // do cliente pra negativo (estorno subtrai). `estorna_credito_id` + índice
  // único parcial (migration 2026-08-26) travam isso no BANCO — antes era um
  // SELECT (texto em descricao) + INSERT sem trava nenhuma, que um duplo-clique
  // quase simultâneo conseguia passar pelos dois antes de qualquer um inserir.
  const { error } = await supabase.from('creditos_clientes').insert({
    pessoa_id: lanc.pessoa_id,
    pessoa_nome: lanc.pessoa_nome,
    valor: lanc.valor,
    tipo: 'estorno',
    descricao: `Estorno de crédito #${id}`,
    estorna_credito_id: id,
  })
  if (error) {
    if (error.code === '23505') redirect(`/painel/vales-credito?erro=${encodeURIComponent('Este crédito já foi estornado.')}`)
    redirect(`/painel/vales-credito?erro=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/painel/vales-credito')
  redirect('/painel/vales-credito')
}
