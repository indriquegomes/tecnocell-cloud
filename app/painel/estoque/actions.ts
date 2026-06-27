'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function registrarMovimento(formData: FormData) {
  const user = await requireAuth()
  const supabase = await createServiceClient()
  const deposito_id = formData.get('deposito_id') as string

  // Produto via datalist: "Nome (codigo)" → busca por nome exato ou prefixo
  const produtoBusca = (formData.get('produto_busca') as string | null)?.trim() ?? ''
  const nomeBusca = produtoBusca.replace(/\s*\([^)]*\)$/, '').trim()
  const { data: produtoEncontrado } = await supabase
    .from('produtos')
    .select('id')
    .ilike('nome', nomeBusca)
    .limit(1)
    .maybeSingle()
  const produto_id = produtoEncontrado?.id ?? (formData.get('produto_id') as string)
  const quantidade = parseInt(formData.get('quantidade') as string, 10)
  const operacao = formData.get('operacao') as string
  const notaFiscal = (formData.get('nota_fiscal') as string | null)?.trim() || null
  const obsRaw = (formData.get('observacao') as string | null)?.trim() || null
  const observacao = notaFiscal
    ? obsRaw ? `NF: ${notaFiscal} | ${obsRaw}` : `NF: ${notaFiscal}`
    : obsRaw

  // Data e hora da movimentação (permite backfill)
  const dataMov = formData.get('data_mov') as string | null
  const horarioMov = formData.get('horario_mov') as string | null
  const createdAt = dataMov && horarioMov
    ? new Date(`${dataMov}T${horarioMov}:00`).toISOString()
    : new Date().toISOString()

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

  const { error: logError } = await supabase.from('movimentacoes_estoque').insert({
    produto_id,
    deposito_id,
    operacao,
    quantidade,
    qtd_anterior: qtdAnterior,
    qtd_nova: qtdNova,
    observacao,
    criado_por: user.id,
    created_at: createdAt,
  })
  if (logError) throw new Error(`Falha ao registrar histórico: ${logError.message}`)

  revalidatePath('/painel/estoque')
  redirect('/painel/estoque')
}
