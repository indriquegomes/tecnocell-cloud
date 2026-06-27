'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function registrarMovimento(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createServiceClient()
  const produto_id = formData.get('produto_id') as string
  const deposito_id = formData.get('deposito_id') as string
  const quantidade = parseInt(formData.get('quantidade') as string, 10)
  const operacao = formData.get('operacao') as string
  const observacao = (formData.get('observacao') as string | null)?.trim() || null

  const { data: atual } = await supabase
    .from('estoque')
    .select('quantidade')
    .eq('produto_id', produto_id)
    .eq('deposito_id', deposito_id)
    .maybeSingle()

  const qtdAnterior = atual?.quantidade ?? 0
  let qtdNova: number
  if (operacao === 'ajuste') {
    qtdNova = quantidade
  } else if (operacao === 'saida') {
    qtdNova = Math.max(0, qtdAnterior - quantidade)
  } else {
    qtdNova = qtdAnterior + quantidade
  }

  const { error } = await supabase
    .from('estoque')
    .upsert(
      { produto_id, deposito_id, quantidade: qtdNova, updated_at: new Date().toISOString() },
      { onConflict: 'produto_id,deposito_id' }
    )

  if (error) throw new Error(error.message)

  await supabase.from('movimentacoes_estoque').insert({
    produto_id,
    deposito_id,
    operacao,
    quantidade,
    qtd_anterior: qtdAnterior,
    qtd_nova: qtdNova,
    observacao,
    criado_por: user.id,
  })

  revalidatePath('/painel/estoque')
  redirect('/painel/estoque')
}
