'use server'

import { createServiceClient, requirePermissao, podeAcao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function uploadImagem(supabase: Awaited<ReturnType<typeof createServiceClient>>, file: File, id: string): Promise<string | null> {
  if (!file || file.size === 0) return null
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${id}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await supabase.storage.from('produtos').upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  })
  if (error) return null
  const { data } = supabase.storage.from('produtos').getPublicUrl(path)
  return data.publicUrl
}

export async function criarProduto(formData: FormData) {
  await requirePermissao('produtos')
  const podeCusto = await podeAcao('produto_custo')
  const supabase = await createServiceClient()
  // evita cadastrar produto com código já existente (duplicidade)
  const codigoNovo = (formData.get('codigo') as string)?.trim() || null
  if (codigoNovo) {
    const { data: dup } = await supabase.from('produtos').select('nome').eq('codigo', codigoNovo).eq('ativo', true).maybeSingle()
    if (dup) throw new Error(`Já existe um produto ativo com o código "${codigoNovo}" (${dup.nome}).`)
  }
  const id = crypto.randomUUID()
  const imagemFile = formData.get('imagem') as File | null
  const imagem_url = imagemFile ? await uploadImagem(supabase, imagemFile, id) : null

  const { error } = await supabase.from('produtos').insert({
    id,
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
    preco: parseFloat((formData.get('preco') as string) || '0'),
    preco_custo: podeCusto ? parseFloat((formData.get('preco_custo') as string) || '0') : 0,
    preco_minimo: podeCusto ? parseFloat((formData.get('preco_minimo') as string) || '0') : 0,
    categoria: (formData.get('categoria') as string) || null,
    marca: (formData.get('marca') as string) || null,
    modelo: (formData.get('modelo') as string) || null,
    codigo: (formData.get('codigo') as string) || null,
    ean: (formData.get('ean') as string) || null,
    unidade: (formData.get('unidade') as string) || 'UN',
    fornecedor_id: (formData.get('fornecedor_id') as string) || null,
    prateleira: (formData.get('prateleira') as string) || null,
    estoque_minimo: parseInt((formData.get('estoque_minimo') as string) || '0', 10),
    controla_serie: formData.get('controla_serie') === 'true',
    ativo: formData.get('ativo') === 'true',
    visivel_catalogo: formData.get('visivel_catalogo') === 'true',
    imagem_url,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/painel/produtos')
  redirect('/painel/produtos')
}

export async function editarProduto(id: string, formData: FormData) {
  await requirePermissao('produtos')
  const podeCusto = await podeAcao('produto_custo')
  const supabase = await createServiceClient()
  const imagemFile = formData.get('imagem') as File | null
  const novaImagem = imagemFile ? await uploadImagem(supabase, imagemFile, id) : undefined

  const updates: Record<string, unknown> = {
    nome: formData.get('nome') as string,
    descricao: (formData.get('descricao') as string) || null,
    preco: parseFloat((formData.get('preco') as string) || '0'),
    // sem permissão de custo: não mexe no custo nem no piso (preserva os existentes)
    ...(podeCusto ? {
      preco_custo: parseFloat((formData.get('preco_custo') as string) || '0'),
      preco_minimo: parseFloat((formData.get('preco_minimo') as string) || '0'),
    } : {}),
    categoria: (formData.get('categoria') as string) || null,
    marca: (formData.get('marca') as string) || null,
    modelo: (formData.get('modelo') as string) || null,
    codigo: (formData.get('codigo') as string) || null,
    ean: (formData.get('ean') as string) || null,
    unidade: (formData.get('unidade') as string) || 'UN',
    fornecedor_id: (formData.get('fornecedor_id') as string) || null,
    prateleira: (formData.get('prateleira') as string) || null,
    estoque_minimo: parseInt((formData.get('estoque_minimo') as string) || '0', 10),
    controla_serie: formData.get('controla_serie') === 'true',
    ativo: formData.get('ativo') === 'true',
    visivel_catalogo: formData.get('visivel_catalogo') === 'true',
    updated_at: new Date().toISOString(),
  }
  if (novaImagem) updates.imagem_url = novaImagem

  const { error } = await supabase.from('produtos').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/produtos')
  redirect('/painel/produtos')
}

export async function deletarProduto(id: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('estoque').delete().eq('produto_id', id)
  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/produtos')
}

export async function criarCategoria(nome: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const hierarquia = nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  await supabase.from('categorias').upsert({ hierarquia, nome, descricao: null }, { onConflict: 'hierarquia' })
  revalidatePath('/painel/produtos')
}

export async function criarMarca(nome: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('marcas').upsert({ nome }, { onConflict: 'nome' })
  revalidatePath('/painel/produtos')
}
