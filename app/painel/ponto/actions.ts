'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Res = { ok: true } | { ok: false; erro: string }

// Inicia um turno pra quem está logado. Se já tiver um aberto, não duplica.
export async function iniciarPonto(): Promise<Res> {
  try {
    const { id } = await requireAuth()
    const supabase = await createServiceClient()

    const { data: aberto } = await supabase.from('pontos').select('id').eq('perfil_id', id).is('saida', null).maybeSingle()
    if (aberto) return { ok: false, erro: 'Você já tem um ponto aberto.' }

    const { data: perfil } = await supabase.from('perfis').select('nome').eq('id', id).maybeSingle()
    const { error } = await supabase.from('pontos').insert({
      id: crypto.randomUUID(), perfil_id: id, nome: perfil?.nome ?? null, entrada: new Date().toISOString(),
    })
    if (error) return { ok: false, erro: error.message }
    revalidatePath('/painel')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.message ? e.message : 'Erro ao iniciar o ponto.' }
  }
}

// Fecha o turno aberto de quem está logado.
export async function pararPonto(): Promise<Res> {
  try {
    const { id } = await requireAuth()
    const supabase = await createServiceClient()

    const { data: aberto } = await supabase.from('pontos').select('id').eq('perfil_id', id).is('saida', null).order('entrada', { ascending: false }).limit(1).maybeSingle()
    if (!aberto) return { ok: false, erro: 'Você não tem ponto aberto.' }

    const { error } = await supabase.from('pontos').update({ saida: new Date().toISOString() }).eq('id', aberto.id)
    if (error) return { ok: false, erro: error.message }
    revalidatePath('/painel')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error && e.message ? e.message : 'Erro ao parar o ponto.' }
  }
}
