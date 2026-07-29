'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type ActionState = { ok: boolean; message: string } | null

export async function abrirCaixa(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePermissao('pdv', formData.get('access_token') as string)
    const supabase = await createServiceClient()
    const lojaId = (formData.get('loja_id') as string | null) || null

    // Impede caixa duplo — agora POR LOJA (cada loja tem o seu caixa)
    let qExist = supabase.from('caixas').select('id').eq('status', 'aberto').limit(1)
    if (lojaId) qExist = qExist.eq('loja_id', lojaId)
    const { data: existente } = await qExist.maybeSingle()
    if (existente) return { ok: false, message: 'Já existe um caixa aberto nesta loja.' }

    const { error } = await supabase.from('caixas').insert({
      valor_abertura: parseFloat(formData.get('valor_abertura') as string) || 0,
      obs_abertura: (formData.get('obs_abertura') as string) || null,
      status: 'aberto',
      loja_id: lojaId,
    })
    if (error) return { ok: false, message: error.message }

    redirect(`/painel/pdv/operacao?aberto=1${lojaId ? `&loja=${lojaId}` : ''}`)
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
    return { ok: false, message: 'Erro ao abrir caixa.' }
  }
}

export async function fecharCaixa(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePermissao('pdv', formData.get('access_token') as string)
    const id = formData.get('caixa_id') as string
    if (!id) return { ok: false, message: 'Caixa não identificado.' }

    const raw = formData.get('valor_fechamento') as string
    const valorFechamento = parseFloat(raw)
    if (raw === '' || isNaN(valorFechamento)) {
      return { ok: false, message: 'Informe o valor contado no caixa.' }
    }

    const supabase = await createServiceClient()

    // Busca caixa p/ obter aberto_em
    const { data: caixa } = await supabase
      .from('caixas')
      .select('aberto_em')
      .eq('id', id)
      .eq('status', 'aberto')
      .maybeSingle()
    if (!caixa) return { ok: false, message: 'Caixa não encontrado ou já fechado.' }

    // Verifica limite de divergência configurado
    const valorEsperado = parseFloat(formData.get('valor_esperado') as string) || 0
    const divergencia = valorFechamento - valorEsperado
    const { data: cfgPdv } = await supabase
      .from('configuracoes')
      .select('valor')
      .eq('chave', 'pdv')
      .maybeSingle()
    const limiteDivergencia: number = (cfgPdv?.valor as Record<string, number> | null)?.limite_divergencia ?? 0
    if (limiteDivergencia > 0 && Math.abs(divergencia) > limiteDivergencia) {
      return {
        ok: false,
        message: `Divergência de R$ ${Math.abs(divergencia).toFixed(2)} ultrapassa o limite configurado de R$ ${limiteDivergencia.toFixed(2)}. Corrija a contagem ou contate o supervisor.`,
      }
    }

    const { error } = await supabase
      .from('caixas')
      .update({
        status: 'fechado',
        valor_fechamento: valorFechamento,
        obs_fechamento: (formData.get('obs_fechamento') as string) || null,
        fechado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'aberto')
    if (error) return { ok: false, message: error.message }

    redirect(`/painel/pdv/operacao?fechado=1&esperado=${valorEsperado}&contado=${valorFechamento}`)
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') throw e
    return { ok: false, message: 'Erro ao fechar caixa.' }
  }
}

export async function registrarReforco(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePermissao('pdv', formData.get('access_token') as string)
    const caixaId = formData.get('caixa_id') as string
    const valor = parseFloat(formData.get('valor') as string) || 0
    if (!caixaId) return { ok: false, message: 'Caixa não identificado.' }
    if (valor <= 0) return { ok: false, message: 'Informe um valor maior que zero.' }

    const supabase = await createServiceClient()
    // Trava: não registrar em caixa já fechado (corrida entre abas — fechou noutra tela)
    const { data: cx } = await supabase.from('caixas').select('status').eq('id', caixaId).maybeSingle()
    if (!cx || cx.status !== 'aberto') return { ok: false, message: 'Este caixa não está mais aberto.' }
    const { error } = await supabase.from('movimentos_caixa').insert({
      caixa_id: caixaId,
      tipo: 'reforco',
      motivo: (formData.get('motivo') as string) || null,
      forma_pagamento: (formData.get('forma_pagamento') as string) || 'Dinheiro',
      valor,
    })
    if (error) return { ok: false, message: error.message }

    revalidatePath('/painel/pdv/operacao')
    return { ok: true, message: 'Reforço registrado com sucesso.' }
  } catch (e) {
    return { ok: false, message: 'Erro ao registrar reforço.' }
  }
}

export async function registrarRetirada(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requirePermissao('pdv', formData.get('access_token') as string)
    const caixaId = formData.get('caixa_id') as string
    const valor = parseFloat(formData.get('valor') as string) || 0
    if (!caixaId) return { ok: false, message: 'Caixa não identificado.' }
    if (valor <= 0) return { ok: false, message: 'Informe um valor maior que zero.' }

    const supabase = await createServiceClient()
    // Trava: não registrar em caixa já fechado (corrida entre abas — fechou noutra tela)
    const { data: cx } = await supabase.from('caixas').select('status').eq('id', caixaId).maybeSingle()
    if (!cx || cx.status !== 'aberto') return { ok: false, message: 'Este caixa não está mais aberto.' }
    const { error } = await supabase.from('movimentos_caixa').insert({
      caixa_id: caixaId,
      tipo: 'retirada',
      motivo: (formData.get('motivo') as string) || null,
      forma_pagamento: (formData.get('forma_pagamento') as string) || 'Dinheiro',
      valor,
    })
    if (error) return { ok: false, message: error.message }

    revalidatePath('/painel/pdv/operacao')
    return { ok: true, message: 'Retirada registrada com sucesso.' }
  } catch (e) {
    return { ok: false, message: 'Erro ao registrar retirada.' }
  }
}
