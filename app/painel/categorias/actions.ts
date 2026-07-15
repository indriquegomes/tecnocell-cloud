'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarCategoria(formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  if (!nome) redirect(`/painel/categorias?erro=${encodeURIComponent('Nome obrigatório')}`)

  const { data: existentes } = await supabase.from('categorias').select('hierarquia, nome')
  // barra nome duplicado (evita "Acessórios" 2x)
  if ((existentes ?? []).some((c) => c.nome?.trim().toLowerCase() === nome.toLowerCase())) {
    redirect(`/painel/categorias?erro=${encodeURIComponent('Já existe uma categoria com esse nome.')}`)
  }
  // chave estável: próximo código sequencial (padrão SIGE), não o nome
  const maxNum = Math.max(0, ...(existentes ?? []).map((c) => (/^\d+$/.test(c.hierarquia) ? parseInt(c.hierarquia, 10) : 0)))
  const codigo = String(maxNum + 1).padStart(4, '0')

  const { error } = await supabase.from('categorias').insert({
    hierarquia: codigo,
    nome,
    descricao: (formData.get('descricao') as string)?.trim() || null,
  })
  if (error) redirect(`/painel/categorias?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/categorias')
  revalidateTag('categorias', 'max')
  redirect(`/painel/categorias?ok=${Date.now()}`)
}

export async function editarCategoria(hierarquia: string, formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const nome = (formData.get('nome') as string)?.trim()
  const { data: existentes } = await supabase.from('categorias').select('hierarquia, nome')
  if ((existentes ?? []).some((c) => c.hierarquia !== hierarquia && c.nome?.trim().toLowerCase() === nome?.toLowerCase())) {
    redirect(`/painel/categorias?editar=${encodeURIComponent(hierarquia)}&erro=${encodeURIComponent('Já existe outra categoria com esse nome.')}`)
  }
  const { error } = await supabase.from('categorias').update({
    nome,
    descricao: (formData.get('descricao') as string)?.trim() || null,
  }).eq('hierarquia', hierarquia)
  if (error) redirect(`/painel/categorias?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/categorias')
  revalidateTag('categorias', 'max')
  redirect(`/painel/categorias?ok=${Date.now()}`)
}

export async function deletarCategoria(hierarquia: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  // não deixa apagar categoria com produtos (deixaria os produtos órfãos)
  const { count } = await supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('categoria', hierarquia)
  if ((count ?? 0) > 0) {
    redirect(`/painel/categorias?erro=${encodeURIComponent(`Esta categoria tem ${count} produto(s). Mova os produtos pra outra categoria antes de excluir.`)}`)
  }
  const { error } = await supabase.from('categorias').delete().eq('hierarquia', hierarquia)
  if (error) redirect(`/painel/categorias?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/categorias')
  revalidateTag('categorias', 'max')
}
