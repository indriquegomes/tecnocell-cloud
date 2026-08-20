'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { responderPerguntaML } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

export async function responderPergunta(perguntaId: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('integracoes')
  if (!texto.trim()) return { ok: false, erro: 'Escreva uma resposta.' }

  const supabase = await createServiceClient()
  const { data: pergunta } = await supabase
    .from('integracoes_mercado_livre_perguntas')
    .select('ml_question_id')
    .eq('id', perguntaId)
    .maybeSingle()
  if (!pergunta) return { ok: false, erro: 'Pergunta não encontrada.' }

  try {
    await responderPerguntaML(pergunta.ml_question_id, texto)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao responder no Mercado Livre.' }
  }

  const { error } = await supabase.from('integracoes_mercado_livre_perguntas').update({
    respondida: true,
    resposta_texto: texto,
    respondida_em: new Date().toISOString(),
  }).eq('id', perguntaId)
  if (error) return { ok: false, erro: 'Resposta enviada ao Mercado Livre, mas falhou ao atualizar aqui — recarregue a página.' }

  revalidatePath('/painel/integracoes/lojas/mercado-livre/perguntas')
  return { ok: true }
}
