'use server'

import { logAtividade } from '@/lib/log-atividade'
import { requireAuth } from '@/lib/supabase/server'

// Ponte pro cliente: o botão dispara o clique, o servidor carimba quem foi.
// Confiar no usuario_id vindo do browser tornaria a auditoria falsificável.
export async function registrarClique(
  tipo: string,
  contexto: Record<string, unknown>,
  url: string,
) {
  let usuario: { id: string; email: string | null } | null = null
  try {
    usuario = await requireAuth()
  } catch {
    return
  }
  await logAtividade(tipo, { ...contexto, clique: true }, usuario, url)
}
