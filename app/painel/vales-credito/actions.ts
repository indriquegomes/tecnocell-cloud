'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function emitirCredito(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  const pessoa_id = formData.get('pessoa_id') as string
  const loja_id = formData.get('loja_id') as string
  const valor = parseFloat(formData.get('valor') as string) || 0
  const descricao = (formData.get('descricao') as string).trim() || 'Crédito emitido'

  if (!pessoa_id) redirect(`/painel/vales-credito?erro=${encodeURIComponent('Selecione um cliente.')}`)
  if (!loja_id) redirect(`/painel/vales-credito?erro=${encodeURIComponent('Selecione a loja do crédito.')}`)
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
    loja_id,
  })

  if (error) redirect(`/painel/vales-credito?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/vales-credito')
  redirect('/painel/vales-credito?ok=1')
}

// BUSCA DE CLIENTE SOB DEMANDA (para o modal "Emitir crédito").
// Antes a tela mandava TODOS os clientes da base (2.053 nomes) só para o campo de
// busca sugerir. Agora a sugestão vem do banco pelo que foi digitado.
export async function buscarClientesParaCredito(
  accessToken: string,
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  await requirePermissao('financeiro', accessToken)
  const t = (termo || '').trim()
  if (t.length < 2) return []
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('pessoas')
    .select('id, nome')
    .in('tipo', ['cliente', 'ambos'])
    .ilike('nome', '%' + t + '%')
    .order('nome')
    .limit(8)
  return ((data ?? []) as { id: string; nome: string | null }[])
    .filter((p) => !!p.nome)
    .map((p) => ({ id: p.id, nome: p.nome as string }))
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
