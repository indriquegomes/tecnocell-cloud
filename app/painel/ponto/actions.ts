'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { aposBatida, conferirPinPonto } from '@/lib/ponto-do-dia'
import { revalidatePath } from 'next/cache'

// Bater ponto — UM caminho só. Grava na tabela `pontos` (modelo de eventos:
// entrada/pausa/retorno/saida) pelo RPC `bater_ponto`, que valida a sequência e
// trava clique duplo por usuário. O widget do painel e o Meu Perfil chamam daqui,
// então a regra é a mesma nos dois.
type Res = { ok: true; saiu?: boolean } | { ok: false; erro: string }

const TIPOS = ['entrada', 'pausa', 'retorno', 'saida'] as const
type Tipo = (typeof TIPOS)[number]

async function bater(tipo: Tipo, pin?: string): Promise<Res> {
  try {
    const { id } = await requireAuth()
    const s = await createServiceClient()

    const conf = await conferirPinPonto(s, id, pin)
    if (!conf.ok) return { ok: false, erro: conf.erro }

    const { data: perfil } = await s.from('perfis').select('pdv_loja_id').eq('id', id).maybeSingle()
    const lojaId = (perfil as { pdv_loja_id?: string | null } | null)?.pdv_loja_id ?? null

    const { data, error } = await s.rpc('bater_ponto', { p_usuario_id: id, p_tipo: tipo, p_loja_id: lojaId })
    if (error) return { ok: false, erro: error.message }
    const r = data as { ok: boolean; erro?: string }
    if (!r.ok) return { ok: false, erro: r.erro ?? 'Erro ao bater o ponto.' }

    // saída fecha o dia: dobra de feriado + banco de horas (atraso/hora extra)
    await aposBatida(s, id, tipo)

    revalidatePath('/painel')
    revalidatePath('/painel/rh')
    revalidatePath('/painel/meu-perfil')
    return { ok: true, saiu: tipo === 'saida' }
  } catch (e) { return { ok: false, erro: e instanceof Error && e.message ? e.message : 'Erro ao bater o ponto.' } }
}

export async function iniciarPonto(pin?: string): Promise<Res> {
  return bater('entrada', pin)
}

export async function pararPonto(pin?: string): Promise<Res> {
  return bater('saida', pin)
}

// Os quatro tipos, do mesmo lugar. O Meu Perfil usa esta para pausa e retorno —
// a regra é uma só, não uma por tela.
export async function baterPontoTipo(tipo: string, pin?: string): Promise<Res> {
  if (!TIPOS.includes(tipo as Tipo)) return { ok: false, erro: 'Tipo de batida inválido.' }
  return bater(tipo as Tipo, pin)
}
