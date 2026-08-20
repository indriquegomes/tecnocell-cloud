'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { responderMensagemML } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

export async function responderMensagem(packId: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('integracoes')
  if (!texto.trim()) return { ok: false, erro: 'Escreva uma mensagem.' }

  try {
    await responderMensagemML(packId, texto)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao enviar no Mercado Livre.' }
  }

  const supabase = await createServiceClient()
  const { error } = await supabase.from('integracoes_mercado_livre_mensagens').update({ lida: true }).eq('ml_pack_id', packId)
  if (error) return { ok: false, erro: 'Resposta enviada ao Mercado Livre, mas falhou ao atualizar aqui — recarregue a página.' }

  revalidatePath('/painel/integracoes/lojas/mercado-livre/mensagens')
  return { ok: true }
}
