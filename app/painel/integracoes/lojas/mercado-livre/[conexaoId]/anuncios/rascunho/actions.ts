'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import {
  buscarCategoriasFilhas, buscarAtributosCategoria, publicarAnuncio, buscarConexao,
  type CategoriaML, type AtributoCategoriaML,
} from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function buscarCategoriasFilhasAction(conexaoId: string, categoriaId: string | null): Promise<CategoriaML[]> {
  await requirePermissao('integracoes')
  return buscarCategoriasFilhas(conexaoId, categoriaId)
}

export async function buscarAtributosCategoriaAction(conexaoId: string, categoriaId: string): Promise<AtributoCategoriaML[]> {
  await requirePermissao('integracoes')
  return buscarAtributosCategoria(conexaoId, categoriaId)
}

type RascunhoUpdate = {
  categoriaId?: string | null
  categoriaNome?: string | null
  titulo?: string | null
  preco?: number | null
  atributos?: Record<string, string>
  fotos?: string[]
}

export async function salvarRascunho(rascunhoId: string, dados: RascunhoUpdate): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('integracoes')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('rascunhos_anuncio_ml').update({
    ...(dados.categoriaId !== undefined ? { categoria_ml_id: dados.categoriaId } : {}),
    ...(dados.categoriaNome !== undefined ? { categoria_ml_nome: dados.categoriaNome } : {}),
    ...(dados.titulo !== undefined ? { titulo: dados.titulo } : {}),
    ...(dados.preco !== undefined ? { preco: dados.preco } : {}),
    ...(dados.atributos !== undefined ? { atributos: dados.atributos } : {}),
    ...(dados.fotos !== undefined ? { fotos: dados.fotos } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', rascunhoId)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

export async function uploadFotoAnuncio(formData: FormData): Promise<{ ok: boolean; url?: string; erro?: string }> {
  await requirePermissao('integracoes')
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { ok: false, erro: 'Nenhum arquivo enviado.' }

  const supabase = await createServiceClient()
  const ext = file.name.split('.').pop() ?? 'jpg'
  const nome = `${crypto.randomUUID()}.${ext}`
  const bytes = await file.arrayBuffer()

  const { error } = await supabase.storage.from('anuncios-ml').upload(nome, bytes, { contentType: file.type, upsert: false })
  if (error) return { ok: false, erro: error.message }

  const { data } = supabase.storage.from('anuncios-ml').getPublicUrl(nome)
  return { ok: true, url: data.publicUrl }
}

export async function publicarRascunho(rascunhoId: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('integracoes')
  const supabase = await createServiceClient()

  const { data: rascunho, error: erroRascunho } = await supabase
    .from('rascunhos_anuncio_ml').select('*').eq('id', rascunhoId).single()
  if (erroRascunho || !rascunho) return { ok: false, erro: 'Rascunho não encontrado.' }

  if (!rascunho.categoria_ml_id) return { ok: false, erro: 'Escolha uma categoria antes de publicar.' }
  if (!rascunho.titulo?.trim()) return { ok: false, erro: 'Preencha o título antes de publicar.' }
  if (!rascunho.preco || rascunho.preco <= 0) return { ok: false, erro: 'Preencha um preço válido antes de publicar.' }
  const fotos = (rascunho.fotos ?? []) as string[]
  if (fotos.length === 0) return { ok: false, erro: 'Adicione pelo menos uma foto antes de publicar.' }

  const conexao = await buscarConexao(rascunho.conexao_id)
  if (!conexao) return { ok: false, erro: 'Conexão do Mercado Livre não encontrada.' }

  const { data: produto } = await supabase.from('produtos').select('id').eq('id', rascunho.produto_id).single()
  if (!produto) return { ok: false, erro: 'Produto não encontrado.' }

  const { data: estoqueLinhas } = await supabase.from('estoque').select('quantidade').eq('produto_id', rascunho.produto_id)
  const quantidade = Math.max(0, (estoqueLinhas ?? []).reduce((soma, e) => soma + Number(e.quantidade ?? 0), 0))

  const atributosObj = (rascunho.atributos ?? {}) as Record<string, string>
  const atributosPayload = Object.entries(atributosObj)
    .filter(([, valor]) => valor)
    .map(([id, valor]) => ({ id, valorTexto: valor }))

  try {
    const publicado = await publicarAnuncio(rascunho.conexao_id, conexao.ml_user_id, {
      titulo: rascunho.titulo,
      categoriaId: rascunho.categoria_ml_id,
      preco: rascunho.preco,
      quantidade,
      fotos,
      atributos: atributosPayload,
    })

    await supabase.from('rascunhos_anuncio_ml').update({
      status: 'publicado', ml_item_id: publicado.id, erro_publicacao: null, updated_at: new Date().toISOString(),
    }).eq('id', rascunhoId)

    await supabase.from('integracoes_mercado_livre_anuncios').upsert({
      ml_item_id: publicado.id,
      conexao_id: rascunho.conexao_id,
      produto_id: rascunho.produto_id,
      titulo_ml: rascunho.titulo,
      preco_ml: rascunho.preco,
      is_catalogo: false,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'ml_item_id' })
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Falha ao publicar no Mercado Livre.'
    await supabase.from('rascunhos_anuncio_ml').update({
      status: 'erro', erro_publicacao: mensagem, updated_at: new Date().toISOString(),
    }).eq('id', rascunhoId)
    return { ok: false, erro: mensagem }
  }

  revalidatePath('/painel/integracoes/produtos')
  revalidatePath(`/painel/integracoes/lojas/mercado-livre/${rascunho.conexao_id}/anuncios`)
  return { ok: true }
}

export async function excluirRascunho(rascunhoId: string, conexaoId: string) {
  await requirePermissao('integracoes')
  const supabase = await createServiceClient()
  await supabase.from('rascunhos_anuncio_ml').delete().eq('id', rascunhoId).eq('status', 'rascunho')
  revalidatePath('/painel/integracoes/produtos')
  redirect(`/painel/integracoes/lojas/mercado-livre/${conexaoId}`)
}
