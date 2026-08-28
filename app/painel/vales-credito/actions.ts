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

  // Tudo numa RPC atômica (migration 2026-08-27): trava saldo negativo (mesmo
  // achado de DIEGO PALMA em 27/08 — dois créditos de R$45+R$100, R$45 já
  // gasto, estornar os dois inteiros deixou -R$45,00) + idempotência (índice
  // único em estorna_credito_id) + — se o crédito veio de uma DEVOLUÇÃO —
  // cria um lançamento 'pagar' pendente, porque estornar não pode fazer
  // dinheiro que saiu de uma devolução simplesmente sumir do sistema.
  const { error } = await supabase.rpc('estornar_credito_cliente', { p_credito_id: id })
  if (error) {
    const m = error.message
    let msg = m
    if (m.startsWith('SALDO_INSUFICIENTE:')) {
      const [, s, v] = m.split(':')
      msg = `Não dá pra estornar: o cliente só tem ${Math.max(0, +s).toFixed(2).replace('.', ',')} de saldo, e esse crédito valia ${(+v).toFixed(2).replace('.', ',')} — parte dele já foi usada. Estornar deixaria o saldo negativo.`
    } else if (error.code === '23505' || m.includes('creditos_clientes_estorno_unico')) {
      msg = 'Este crédito já foi estornado.'
    }
    redirect(`/painel/vales-credito?erro=${encodeURIComponent(msg)}`)
  }

  revalidatePath('/painel/vales-credito')
  revalidatePath('/painel/financeiro')   // a dívida nova (se houver) precisa aparecer lá
  redirect('/painel/vales-credito')
}
