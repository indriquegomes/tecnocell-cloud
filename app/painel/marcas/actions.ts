'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarMarca(formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  if (!nome) redirect(`/painel/marcas?erro=${encodeURIComponent('Nome obrigatório')}`)
  const { data: ex } = await supabase.from('marcas').select('id').ilike('nome', nome).maybeSingle()
  if (ex) redirect(`/painel/marcas?erro=${encodeURIComponent('Já existe uma marca com esse nome.')}`)
  const { error } = await supabase.from('marcas').insert({ nome })
  if (error) redirect(`/painel/marcas?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/marcas')
  redirect('/painel/marcas')
}

export async function editarMarca(id: string, formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  if (!nome) redirect(`/painel/marcas?editar=${id}&erro=${encodeURIComponent('Nome obrigatório')}`)
  const { data: atual } = await supabase.from('marcas').select('nome').eq('id', id).maybeSingle()
  if (!atual) redirect('/painel/marcas')
  const { data: ex } = await supabase.from('marcas').select('id').ilike('nome', nome).neq('id', id).maybeSingle()
  if (ex) redirect(`/painel/marcas?editar=${id}&erro=${encodeURIComponent('Já existe outra marca com esse nome.')}`)
  // renomeia e propaga pros produtos (marca é ligada por texto)
  if (atual.nome !== nome) await supabase.from('produtos').update({ marca: nome }).eq('marca', atual.nome)
  const { error } = await supabase.from('marcas').update({ nome }).eq('id', id)
  if (error) redirect(`/painel/marcas?editar=${id}&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/marcas')
  redirect('/painel/marcas')
}

export async function deletarMarca(id: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const { data: m } = await supabase.from('marcas').select('nome').eq('id', id).maybeSingle()
  if (!m) redirect('/painel/marcas')
  const { count } = await supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('marca', m.nome)
  if ((count ?? 0) > 0) {
    redirect(`/painel/marcas?erro=${encodeURIComponent(`Esta marca tem ${count} produto(s). Troque a marca deles antes de excluir.`)}`)
  }
  const { error } = await supabase.from('marcas').delete().eq('id', id)
  if (error) redirect(`/painel/marcas?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/marcas')
}
