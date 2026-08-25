'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import {
  buscarCategoriasFilhas, buscarAtributosCategoria, buscarTiposAnuncioDisponiveis, publicarAnuncio, buscarConexao,
  DEPOSITO_PETROPOLIS_LOJA,
  type CategoriaML, type AtributoCategoriaML, type TipoAnuncioML,
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

export async function buscarTiposAnuncioAction(conexaoId: string, categoriaId: string): Promise<TipoAnuncioML[]> {
  await requirePermissao('integracoes')
  const conexao = await buscarConexao(conexaoId)
  if (!conexao) throw new Error('Conexão do Mercado Livre não encontrada.')
  return buscarTiposAnuncioDisponiveis(conexaoId, conexao.ml_user_id, categoriaId)
}

type RascunhoUpdate = {
  categoriaId?: string | null
  categoriaNome?: string | null
  titulo?: string | null
  preco?: number | null
  atributos?: Record<string, string>
  fotos?: string[]
  listingTypeId?: string | null
  condicao?: 'new' | 'used'
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
    ...(dados.listingTypeId !== undefined ? { listing_type_id: dados.listingTypeId } : {}),
    ...(dados.condicao !== undefined ? { condicao: dados.condicao } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', rascunhoId)
  if (error) return { ok: false, erro: error.message }
  return { ok: true }
}

export async function uploadFotoAnuncio(formData: FormData): Promise<{ ok: boolean; url?: string; erro?: string }> {
  await requirePermissao('integracoes')
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { ok: false, erro: 'Nenhum arquivo enviado.' }

  // extensão do content-type observado, não do nome escolhido pelo cliente — mesmo
  // buraco de upload achado e corrigido em produtos/clientes (25/08). Bucket público.
  const EXT_POR_TIPO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
  const ext = EXT_POR_TIPO[file.type]
  if (!ext) return { ok: false, erro: 'Envie uma imagem (jpg, png, webp ou gif).' }
  const supabase = await createServiceClient()
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

  // Sem essa checagem, um clique duplo (ou reabrir uma aba antiga) publicava
  // o mesmo rascunho de novo — um segundo anúncio de verdade no Mercado
  // Livre. Único jeito de saber com certeza que já publicou é o próprio
  // banco, não dá pra confiar só no botão desabilitado na tela.
  if (rascunho.status === 'publicado' || rascunho.ml_item_id) {
    return { ok: false, erro: `Este rascunho já virou o anúncio ${rascunho.ml_item_id} — não publica de novo.` }
  }

  if (!rascunho.categoria_ml_id) return { ok: false, erro: 'Escolha uma categoria antes de publicar.' }
  if (!rascunho.titulo?.trim()) return { ok: false, erro: 'Preencha o título antes de publicar.' }
  if (!rascunho.preco || rascunho.preco <= 0) return { ok: false, erro: 'Preencha um preço válido antes de publicar.' }
  if (!rascunho.listing_type_id) return { ok: false, erro: 'Escolha o tipo de anúncio (grátis, clássico, premium...) antes de publicar.' }
  const fotos = (rascunho.fotos ?? []) as string[]
  if (fotos.length === 0) return { ok: false, erro: 'Adicione pelo menos uma foto antes de publicar.' }

  const conexao = await buscarConexao(rascunho.conexao_id)
  if (!conexao) return { ok: false, erro: 'Conexão do Mercado Livre não encontrada.' }

  const { data: produto } = await supabase.from('produtos').select('id').eq('id', rascunho.produto_id).single()
  if (!produto) return { ok: false, erro: 'Produto não encontrado.' }

  // Mesma base que sincronizarEstoqueML usa depois (só o depósito
  // Petrópolis Loja) — se fosse a soma de todos os depósitos, o número
  // mandado pro Mercado Livre na criação nunca bateria com o que a
  // sincronização automática mantém dali em diante.
  const { data: estoqueLinha, error: erroEstoque } = await supabase
    .from('estoque').select('quantidade')
    .eq('produto_id', rascunho.produto_id)
    .eq('deposito_id', DEPOSITO_PETROPOLIS_LOJA)
    .maybeSingle()
  if (erroEstoque) return { ok: false, erro: 'Falha ao consultar estoque: ' + erroEstoque.message }
  const quantidade = Math.max(0, Math.floor(Number(estoqueLinha?.quantidade ?? 0)))
  if (quantidade < 1) return { ok: false, erro: 'Produto sem estoque no depósito Petrópolis Loja — o Mercado Livre não aceita anúncio com quantidade zero.' }

  // Refiltra contra a lista de atributos ATUAL da categoria — um rascunho
  // salvo antes da correção de read_only pode ter chave presa (achado
  // testando de verdade) que o Mercado Livre agora rejeitaria nesta versão
  // do código; assim ele se autocorrige na próxima tentativa de publicar,
  // sem precisar mexer no banco na mão.
  const atributosValidos = await buscarAtributosCategoria(rascunho.conexao_id, rascunho.categoria_ml_id)
  const idsValidos = new Set(atributosValidos.map((a) => a.id))
  const atributosObj = (rascunho.atributos ?? {}) as Record<string, string>
  const atributosPayload = Object.entries(atributosObj)
    .filter(([id, valor]) => valor && idsValidos.has(id))
    .map(([id, valor]) => ({ id, valorTexto: valor }))

  try {
    const publicado = await publicarAnuncio(rascunho.conexao_id, {
      titulo: rascunho.titulo,
      categoriaId: rascunho.categoria_ml_id,
      preco: rascunho.preco,
      quantidade,
      fotos,
      listingTypeId: rascunho.listing_type_id,
      condicao: rascunho.condicao === 'used' ? 'used' : 'new',
      atributos: atributosPayload,
    })

    // A partir daqui o anúncio JÁ EXISTE de verdade no Mercado Livre — uma
    // falha nestas duas gravações não pode virar "tenta de novo" (criaria
    // um segundo anúncio real). Mensagem deixa claro que já foi, só não
    // ficou registrado aqui.
    const { error: erroAtualizarRascunho } = await supabase.from('rascunhos_anuncio_ml').update({
      status: 'publicado', ml_item_id: publicado.id, erro_publicacao: null, updated_at: new Date().toISOString(),
    }).eq('id', rascunhoId)
    if (erroAtualizarRascunho) {
      return { ok: false, erro: `Anúncio ${publicado.id} foi criado no Mercado Livre, mas não deu pra atualizar o rascunho aqui: ${erroAtualizarRascunho.message}. NÃO publique de novo — avise o suporte.` }
    }

    const { error: erroAnuncio } = await supabase.from('integracoes_mercado_livre_anuncios').upsert({
      ml_item_id: publicado.id,
      conexao_id: rascunho.conexao_id,
      produto_id: rascunho.produto_id,
      titulo_ml: rascunho.titulo,
      preco_ml: rascunho.preco,
      is_catalogo: false,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'ml_item_id' })
    if (erroAnuncio) {
      return { ok: false, erro: `Anúncio ${publicado.id} foi criado no Mercado Livre, mas não deu pra registrar aqui (estoque não vai sincronizar sozinho): ${erroAnuncio.message}. NÃO publique de novo — avise o suporte.` }
    }
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
