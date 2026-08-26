'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Usa a tabela `pontos` que JÁ EXISTE (modelo de eventos: entrada/pausa/retorno/saida,
// usada em Meu Perfil / RH / Escala). O botão do dashboard grava no MESMO lugar.
type Res = { ok: true } | { ok: false; erro: string }

// bater_ponto (migration 2026-08-26): checa a última batida e insere numa
// transação só, travada por usuário (pg_advisory_xact_lock) — sem isso, duas
// abas/dispositivos da MESMA pessoa clicando quase junto liam "não está em
// operação" antes de qualquer um inserir e duplicavam a entrada (confirmado
// ao vivo em teste de corrida 25/08).
async function bater(tipo: 'entrada' | 'saida'): Promise<Res> {
  try {
    const { id } = await requireAuth()
    const s = await createServiceClient()
    const { data: perfil } = await s.from('perfis').select('pdv_loja_id').eq('id', id).maybeSingle()
    const { data, error } = await s.rpc('bater_ponto', {
      p_usuario_id: id,
      p_tipo: tipo,
      p_loja_id: (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null,
    })
    if (error) return { ok: false, erro: error.message }
    const r = data as { ok: boolean; erro?: string }
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Erro ao bater o ponto.' }
    revalidatePath('/painel')
    return { ok: true }
  } catch (e) { return { ok: false, erro: e instanceof Error && e.message ? e.message : 'Erro ao bater o ponto.' } }
}

export async function iniciarPonto(): Promise<Res> {
  return bater('entrada')
}

export async function pararPonto(): Promise<Res> {
  return bater('saida')
}
