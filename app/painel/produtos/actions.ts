'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarProduto(formData: FormData) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('produtos').insert({
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
    preco: parseFloat((formData.get('preco') as string) || '0'),
    preco_custo: parseFloat((formData.get('preco_custo') as string) || '0'),
    categoria: (formData.get('categoria') as string) || null,
    marca: (formData.get('marca') as string) || null,
    codigo: (formData.get('codigo') as string) || null,
    ativo: formData.get('ativo') === 'true',
    visivel_catalogo: true,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/painel/produtos')
  redirect('/painel/produtos')
}

export async function editarProduto(id: string, formData: FormData) {
  const supabase = await createServiceClient()
  const { error } = await supabase.from('produtos').update({
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
    preco: parseFloat((formData.get('preco') as string) || '0'),
    preco_custo: parseFloat((formData.get('preco_custo') as string) || '0'),
    categoria: (formData.get('categoria') as string) || null,
    marca: (formData.get('marca') as string) || null,
    codigo: (formData.get('codigo') as string) || null,
    ativo: formData.get('ativo') === 'true',
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/produtos')
  redirect('/painel/produtos')
}

export async function deletarProduto(id: string) {
  const supabase = await createServiceClient()
  await supabase.from('estoque').delete().eq('produto_id', id)
  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/produtos')
}

export async function criarCategoria(nome: string) {
  const supabase = await createServiceClient()
  const hierarquia = nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  await supabase.from('categorias').upsert({ hierarquia, nome, descricao: null }, { onConflict: 'hierarquia' })
  revalidatePath('/painel/produtos')
}

export async function criarMarca(nome: string) {
  const supabase = await createServiceClient()
  await supabase.from('marcas').upsert({ nome }, { onConflict: 'nome' })
  revalidatePath('/painel/produtos')
}
