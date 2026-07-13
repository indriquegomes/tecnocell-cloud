'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// A tabela marcas tem só a coluna "nome" (chave). Ligação com produtos é por texto.
export async function criarMarca(formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  if (!nome) redirect(`/painel/marcas?erro=${encodeURIComponent('Nome obrigatório')}`)
  const { data: ex } = await supabase.from('marcas').select('nome').ilike('nome', nome).maybeSingle()
  if (ex) redirect(`/painel/marcas?erro=${encodeURIComponent('Já existe uma marca com esse nome.')}`)
  const { error } = await supabase.from('marcas').insert({ nome })
  if (error) redirect(`/painel/marcas?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/marcas')
  redirect(`/painel/marcas?ok=${Date.now()}`)
}

export async function editarMarca(nomeAtual: string, formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  if (!nome) redirect(`/painel/marcas?editar=${encodeURIComponent(nomeAtual)}&erro=${encodeURIComponent('Nome obrigatório')}`)
  if (nome === nomeAtual) redirect(`/painel/marcas?ok=${Date.now()}`)
  const { data: ex } = await supabase.from('marcas').select('nome').ilike('nome', nome).maybeSingle()
  if (ex) redirect(`/painel/marcas?editar=${encodeURIComponent(nomeAtual)}&erro=${encodeURIComponent('Já existe outra marca com esse nome.')}`)
  // renomeia e propaga pros produtos (marca é ligada por texto)
  await supabase.from('produtos').update({ marca: nome }).eq('marca', nomeAtual)
  const { error } = await supabase.from('marcas').update({ nome }).eq('nome', nomeAtual)
  if (error) redirect(`/painel/marcas?editar=${encodeURIComponent(nomeAtual)}&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/marcas')
  redirect(`/painel/marcas?ok=${Date.now()}`)
}

export async function deletarMarca(nome: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const { count } = await supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('marca', nome)
  if ((count ?? 0) > 0) {
    redirect(`/painel/marcas?erro=${encodeURIComponent(`Esta marca tem ${count} produto(s). Troque a marca deles antes de excluir.`)}`)
  }
  const { error } = await supabase.from('marcas').delete().eq('nome', nome)
  if (error) redirect(`/painel/marcas?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/marcas')
}
