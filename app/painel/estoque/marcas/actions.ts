'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarMarca(formData: FormData) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string | null)?.trim() ?? ''
  if (!nome) redirect('/painel/estoque/marcas?erro=Informe o nome da marca')

  const { error } = await supabase.from('marcas').upsert({ nome }, { onConflict: 'nome', ignoreDuplicates: true })
  if (error) redirect(`/painel/estoque/marcas?erro=${encodeURIComponent(error.message)}`)

  revalidatePath('/painel/estoque/marcas')
  redirect('/painel/estoque/marcas?ok=1')
}

export async function renomearMarca(formData: FormData) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const antigo = (formData.get('nome_antigo') as string | null)?.trim() ?? ''
  const novo = (formData.get('nome_novo') as string | null)?.trim() ?? ''
  if (!antigo || !novo || antigo === novo) redirect('/painel/estoque/marcas')

  // cria a nova, migra os produtos e remove a antiga
  await supabase.from('marcas').upsert({ nome: novo }, { onConflict: 'nome', ignoreDuplicates: true })
  await supabase.from('produtos').update({ marca: novo }).eq('marca', antigo)
  await supabase.from('marcas').delete().eq('nome', antigo)

  revalidatePath('/painel/estoque/marcas')
  revalidatePath('/painel/produtos')
  redirect('/painel/estoque/marcas?ok=1')
}

export async function excluirMarca(formData: FormData) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string | null)?.trim() ?? ''
  if (!nome) redirect('/painel/estoque/marcas')

  const { error } = await supabase.from('marcas').delete().eq('nome', nome)
  if (error) redirect(`/painel/estoque/marcas?erro=${encodeURIComponent(error.message)}`)

  revalidatePath('/painel/estoque/marcas')
  redirect('/painel/estoque/marcas?ok=1')
}
