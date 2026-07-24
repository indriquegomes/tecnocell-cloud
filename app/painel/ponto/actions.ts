'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// Usa a tabela `pontos` que JÁ EXISTE (modelo de eventos: entrada/pausa/retorno/saida,
// usada em Meu Perfil / RH / Escala). O botão do dashboard grava no MESMO lugar.
type Res = { ok: true } | { ok: false; erro: string }

type SB = Awaited<ReturnType<typeof createServiceClient>>

// Está em operação se a ÚLTIMA batida de hoje for entrada ou retorno.
async function emOperacao(s: SB, userId: string, hoje: string): Promise<boolean> {
  const { data } = await s.from('pontos').select('tipo')
    .eq('usuario_id', userId).gte('criado_em', `${hoje}T00:00:00-03:00`)
    .order('criado_em', { ascending: false }).limit(1)
  const t = (data?.[0] as { tipo?: string } | undefined)?.tipo
  return t === 'entrada' || t === 'retorno'
}

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export async function iniciarPonto(): Promise<Res> {
  try {
    const { id } = await requireAuth()
    const s = await createServiceClient()
    if (await emOperacao(s, id, hojeSP())) return { ok: false, erro: 'Você já está em operação.' }
    const { data: perfil } = await s.from('perfis').select('pdv_loja_id').eq('id', id).maybeSingle()
    const { error } = await s.from('pontos').insert({ usuario_id: id, tipo: 'entrada', loja_id: (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null })
    if (error) return { ok: false, erro: error.message }
    revalidatePath('/painel')
    return { ok: true }
  } catch (e) { return { ok: false, erro: e instanceof Error && e.message ? e.message : 'Erro ao iniciar o ponto.' } }
}

export async function pararPonto(): Promise<Res> {
  try {
    const { id } = await requireAuth()
    const s = await createServiceClient()
    if (!(await emOperacao(s, id, hojeSP()))) return { ok: false, erro: 'Você não está em operação.' }
    const { data: perfil } = await s.from('perfis').select('pdv_loja_id').eq('id', id).maybeSingle()
    const { error } = await s.from('pontos').insert({ usuario_id: id, tipo: 'saida', loja_id: (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null })
    if (error) return { ok: false, erro: error.message }
    revalidatePath('/painel')
    return { ok: true }
  } catch (e) { return { ok: false, erro: e instanceof Error && e.message ? e.message : 'Erro ao parar o ponto.' } }
}
