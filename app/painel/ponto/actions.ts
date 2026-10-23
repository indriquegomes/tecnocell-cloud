'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Usa a tabela `pontos` que JÁ EXISTE (modelo de eventos: entrada/pausa/retorno/saida,
// usada em Meu Perfil / RH / Escala). O botão do dashboard grava no MESMO lugar.
type Res = { ok: true; saiu?: boolean } | { ok: false; erro: string }

// bater_ponto (migration 2026-08-26): checa a última batida e insere numa
// transação só, travada por usuário (pg_advisory_xact_lock) — sem isso, duas
// abas/dispositivos da MESMA pessoa clicando quase junto liam "não está em
// operação" antes de qualquer um inserir e duplicavam a entrada.
async function bater(tipo: 'entrada' | 'saida', pin?: string): Promise<Res> {
  try {
    const { id } = await requireAuth()
    const s = await createServiceClient()
    // PIN de 4 dígitos: confirma que é a própria pessoa (evita bater no login errado).
    // Tolerante: se a coluna pin_ponto ainda não existir (migration não rodou), busca só
    // a loja e usa '1234' — senão o ponto sairia com loja nula.
    const { data: perfil, error: errPerfil } = await s.from('perfis').select('pdv_loja_id, pin_ponto').eq('id', id).maybeSingle()
    let pdvLojaId = (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null
    let pinSalvo = (perfil as { pin_ponto?: string | null } | null)?.pin_ponto || '1234'
    if (errPerfil) {
      const { data: soLoja } = await s.from('perfis').select('pdv_loja_id').eq('id', id).maybeSingle()
      pdvLojaId = (soLoja as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null
      pinSalvo = '1234'
    }
    if ((pin ?? '').trim() !== pinSalvo) return { ok: false, erro: 'PIN incorreto.' }
    const { data, error } = await s.rpc('bater_ponto', {
      p_usuario_id: id,
      p_tipo: tipo,
      p_loja_id: pdvLojaId,
    })
    if (error) return { ok: false, erro: error.message }
    const r = data as { ok: boolean; erro?: string }
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Erro ao bater o ponto.' }
    revalidatePath('/painel')
    return { ok: true, saiu: tipo === 'saida' }
  } catch (e) { return { ok: false, erro: e instanceof Error && e.message ? e.message : 'Erro ao bater o ponto.' } }
}

export async function iniciarPonto(pin?: string): Promise<Res> {
  return bater('entrada', pin)
}

export async function pararPonto(pin?: string): Promise<Res> {
  return bater('saida', pin)
}
