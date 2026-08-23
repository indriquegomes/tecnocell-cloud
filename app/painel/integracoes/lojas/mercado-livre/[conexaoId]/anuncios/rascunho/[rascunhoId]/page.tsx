import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { RascunhoEditor } from './RascunhoEditor'

// Publicar pode levar mais que o padrão da Vercel (busca tipo de anúncio
// disponível + chamada de criação no Mercado Livre) — mesmo teto de
// segurança de importarAnuncios. Precisa estar aqui (page.tsx), não no
// actions.ts: Server Actions herdam o maxDuration da página que os chama,
// e um arquivo 'use server' só pode exportar função async.
export const maxDuration = 60

export type RascunhoAnuncio = {
  id: string
  produto_id: string
  conexao_id: string
  categoria_ml_id: string | null
  categoria_ml_nome: string | null
  titulo: string | null
  atributos: Record<string, string>
  fotos: string[]
  preco: number | null
  status: 'rascunho' | 'publicado' | 'erro'
  ml_item_id: string | null
  erro_publicacao: string | null
  listing_type_id: string | null
  condicao: 'new' | 'used'
}

export default async function RascunhoAnuncioPage({
  params,
}: {
  params: Promise<{ conexaoId: string; rascunhoId: string }>
}) {
  const { conexaoId, rascunhoId } = await params
  const supabase = await createServiceClient()

  const { data: rascunho } = await supabase
    .from('rascunhos_anuncio_ml')
    .select('id, produto_id, conexao_id, categoria_ml_id, categoria_ml_nome, titulo, atributos, fotos, preco, status, ml_item_id, erro_publicacao, listing_type_id, condicao')
    .eq('id', rascunhoId)
    .eq('conexao_id', conexaoId)
    .maybeSingle()
  if (!rascunho) notFound()

  const { data: produto } = await supabase.from('produtos').select('id, nome, codigo, imagem_url').eq('id', rascunho.produto_id).single()

  return (
    <RascunhoEditor
      rascunho={rascunho as RascunhoAnuncio}
      produtoNome={produto?.nome ?? rascunho.produto_id}
      produtoCodigo={produto?.codigo ?? null}
      produtoImagem={produto?.imagem_url ?? null}
    />
  )
}
