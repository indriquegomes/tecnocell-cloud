'use server'

import { createServiceClient, requirePermissao, requireAuth } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function criarRascunhoEIrPraEdicao(produtoId: string, formData: FormData) {
  await requirePermissao('integracoes')
  const conexaoId = formData.get('conexaoId') as string
  const supabase = await createServiceClient()

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

  if (error || !data) {
    redirect(`/painel/integracoes/produtos?erro=${encodeURIComponent('Não deu pra iniciar o anúncio: ' + (error?.message ?? 'erro desconhecido'))}`)
  }

  redirect(`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios/rascunho/${data.id}`)
}
