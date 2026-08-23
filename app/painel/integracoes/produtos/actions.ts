'use server'

import { createServiceClient, requirePermissao, requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function criarRascunhoEIrPraEdicao(produtoId: string, formData: FormData) {
  await requirePermissao('integracoes')
  const conexaoId = formData.get('conexaoId') as string
  const supabase = await createServiceClient()

  // Já tem rascunho não publicado desse produto pra essa loja? Continua ele
  // em vez de criar outro — sem essa checagem, clicar "Publicar" de novo
  // (ex: depois de sair sem terminar) duplicava o rascunho.
  const { data: existente } = await supabase
    .from('rascunhos_anuncio_ml')
    .select('id')
    .eq('produto_id', produtoId)
    .eq('conexao_id', conexaoId)
    .neq('status', 'publicado')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existente) redirect(`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios/rascunho/${existente.id}`)

  let criadoPor: string | null = null
  try { criadoPor = (await requireAuth()).id } catch { /* segue sem autor registrado */ }

  const { data: produto } = await supabase.from('produtos').select('nome, preco').eq('id', produtoId).single()

  const { data, error } = await supabase.from('rascunhos_anuncio_ml').insert({
    produto_id: produtoId,
    conexao_id: conexaoId,
    titulo: produto?.nome ?? null,
    preco: produto?.preco ?? null,
    criado_por: criadoPor,
  }).select('id').single()

  if (error?.code === '23505') {
    // Dois cliques quase juntos passaram pela checagem acima antes de
    // qualquer um inserir — o índice único no banco barrou o segundo.
    // Não é erro de verdade: só significa que o primeiro já criou o
    // rascunho, então manda pra ele.
    const { data: criadoPeloOutro } = await supabase
      .from('rascunhos_anuncio_ml').select('id')
      .eq('produto_id', produtoId).eq('conexao_id', conexaoId)
      .neq('status', 'publicado')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (criadoPeloOutro) redirect(`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios/rascunho/${criadoPeloOutro.id}`)
  }

  if (error || !data) {
    redirect(`/painel/integracoes/produtos?erro=${encodeURIComponent('Não deu pra iniciar o anúncio: ' + (error?.message ?? 'erro desconhecido'))}`)
  }

  redirect(`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios/rascunho/${data.id}`)
}
