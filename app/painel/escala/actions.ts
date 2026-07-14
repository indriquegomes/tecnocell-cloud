'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ActionState = { ok: boolean; message: string } | null

// ── ESCALA PADRÃO (a rotina: a Duda entra 08h toda segunda) ────────────────
// Salva o dia inteiro de uma pessoa: os turnos que existem, apaga os que sumiram.
export async function salvarEscalaDia(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const token = fd.get('access_token') as string
    await requirePermissao('rh', token)
    const supabase = await createServiceClient()

    const perfilId = fd.get('perfil_id') as string
    const lojaId = (fd.get('loja_id') as string) || null
    const dia = Number(fd.get('dia'))
    const entrada = (fd.get('entrada') as string) || ''
    const saida = (fd.get('saida') as string) || ''
    const folga = fd.getAll('folga').includes('1')

    if (!perfilId || isNaN(dia)) return { ok: false, message: 'Dados incompletos.' }

    // folga (ou campos vazios) = não trabalha nesse dia → remove o turno
    if (folga || !entrada || !saida) {
      await supabase.from('escalas').delete().eq('perfil_id', perfilId).eq('dia', dia)
      revalidatePath('/painel/escala')
      return { ok: true, message: 'Folga registrada.' }
    }

    if (saida <= entrada) return { ok: false, message: 'A saída tem que ser depois da entrada.' }

    // upsert pelo par (perfil_id, dia) — o unique da tabela garante 1 turno por dia
    const { error } = await supabase
      .from('escalas')
      .upsert({ perfil_id: perfilId, loja_id: lojaId, dia, entrada, saida, ativo: true }, { onConflict: 'perfil_id,dia' })
    if (error) return { ok: false, message: error.message }

    revalidatePath('/painel/escala')
    return { ok: true, message: 'Escala salva.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Erro ao salvar.' }
  }
}

// ── ALTERAÇÃO de um dia específico (a escala varia) ─────────────────────────
// Sobrescreve a rotina num dia: folga, ou entrar/sair em outro horário.
export async function salvarExcecao(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const token = fd.get('access_token') as string
    const usuario = await requirePermissao('rh', token)
    const supabase = await createServiceClient()

    const perfilId = fd.get('perfil_id') as string
    const data = fd.get('data') as string
    const folga = fd.getAll('folga').includes('1')
    const entrada = (fd.get('entrada') as string) || null
    const saida = (fd.get('saida') as string) || null
    const motivo = ((fd.get('motivo') as string) || '').trim() || null

    if (!perfilId || !data) return { ok: false, message: 'Escolha a pessoa e o dia.' }
    if (!folga && (!entrada || !saida)) return { ok: false, message: 'Informe o horário ou marque folga.' }
    if (!folga && saida && entrada && saida <= entrada) return { ok: false, message: 'A saída tem que ser depois da entrada.' }

    const { error } = await supabase
      .from('escala_excecoes')
      .upsert({
        perfil_id: perfilId,
        data,
        folga,
        entrada: folga ? null : entrada,
        saida: folga ? null : saida,
        motivo,
        criado_por: usuario.id,
      }, { onConflict: 'perfil_id,data' })
    if (error) return { ok: false, message: error.message }

    revalidatePath('/painel/escala')
    return { ok: true, message: folga ? 'Folga registrada.' : 'Alteração salva.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Erro ao salvar.' }
  }
}

export async function removerExcecao(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requirePermissao('rh', fd.get('access_token') as string)
    const supabase = await createServiceClient()
    await supabase.from('escala_excecoes').delete().eq('id', fd.get('id') as string)
    revalidatePath('/painel/escala')
    return { ok: true, message: 'Alteração removida.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Erro ao remover.' }
  }
}
