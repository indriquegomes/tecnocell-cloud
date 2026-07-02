'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function campos(formData: FormData) {
  return {
    nome: (formData.get('nome') as string)?.trim(),
    tipo: (formData.get('tipo') as string) === 'caixa' ? 'caixa' : 'banco',
  }
}

export async function criarConta(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas').insert({ ...campos(formData), ativa: true })
  if (error) redirect(`/painel/contas?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/contas')
  revalidatePath('/painel/formas-pagamento')
  redirect('/painel/contas')
}

export async function editarConta(id: string, formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas')
    .update({ ...campos(formData), ativa: formData.get('ativa') === 'true' })
    .eq('id', id)
  if (error) redirect(`/painel/contas?editar=${id}&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/contas')
  revalidatePath('/painel/formas-pagamento')
  redirect('/painel/contas')
}

export async function deletarConta(id: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas').delete().eq('id', id)
  if (error) redirect(`/painel/contas?erro=${encodeURIComponent('Não dá pra excluir: há formas de pagamento usando esta conta.')}`)
  revalidatePath('/painel/contas')
}
