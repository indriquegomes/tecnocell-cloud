'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function registrarMovimento(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const produto_id = formData.get('produto_id') as string
  const deposito_id = formData.get('deposito_id') as string
  const quantidade = parseInt(formData.get('quantidade') as string, 10)
  const operacao = formData.get('operacao') as string // 'entrada' | 'saida' | 'ajuste'

  const { data: atual } = await supabase
    .from('estoque')
    .select('quantidade')
    .eq('produto_id', produto_id)
    .eq('deposito_id', deposito_id)
    .maybeSingle()

  let novaQtd: number
  if (operacao === 'ajuste') {
    novaQtd = quantidade
  } else if (operacao === 'saida') {
    novaQtd = Math.max(0, (atual?.quantidade ?? 0) - quantidade)
  } else {
    novaQtd = (atual?.quantidade ?? 0) + quantidade
  }

  const { error } = await supabase
    .from('estoque')
    .upsert(
      { produto_id, deposito_id, quantidade: novaQtd, updated_at: new Date().toISOString() },
      { onConflict: 'produto_id,deposito_id' }
    )

  if (error) throw new Error(error.message)
  revalidatePath('/painel/estoque')
  redirect('/painel/estoque')
}
