'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ActionState = { ok: boolean; message: string } | null

export async function registrarDevolucao(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAuth()
    const consignadoId = formData.get('consignado_id') as string
    if (!consignadoId) return { ok: false, message: 'Consignado não identificado.' }

    const supabase = await createServiceClient()

    // Busca itens do consignado
    const { data: itens, error: eItens } = await supabase
      .from('itens_consignado')
      .select('id, quantidade, devolvido')
      .eq('consignado_id', consignadoId)
    if (eItens) return { ok: false, message: eItens.message }

    for (const item of itens ?? []) {
      const rawQty = formData.get(`devolvido_${item.id}`)
      if (rawQty === null) continue
      const novoDevolvido = Math.min(
        item.quantidade,
        (item.devolvido ?? 0) + Math.max(0, parseInt(rawQty as string) || 0),
      )
      if (novoDevolvido !== (item.devolvido ?? 0)) {
        await supabase
          .from('itens_consignado')
          .update({ devolvido: novoDevolvido })
          .eq('id', item.id)
      }
    }

    // Recalcula status do consignado
    const { data: itensAtualizados } = await supabase
      .from('itens_consignado')
      .select('quantidade, devolvido')
      .eq('consignado_id', consignadoId)
    const todos = itensAtualizados ?? []
    const todoDevolvido = todos.every((i) => (i.devolvido ?? 0) >= i.quantidade)
    const algumDevolvido = todos.some((i) => (i.devolvido ?? 0) > 0)
    const novoStatus = todoDevolvido ? 'devolvido' : algumDevolvido ? 'parcial' : 'aberto'

    await supabase
      .from('consignados')
      .update({ status: novoStatus })
      .eq('id', consignadoId)

    revalidatePath('/painel/consignado')
    return { ok: true, message: todoDevolvido ? 'Devolução total registrada.' : 'Devolução parcial registrada.' }
  } catch {
    return { ok: false, message: 'Erro ao registrar devolução.' }
  }
}

export async function registrarAcerto(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireAuth()
    const consignadoId = formData.get('consignado_id') as string
    const formaId = formData.get('forma_pagamento_id') as string
    const obs = (formData.get('obs') as string) || null
    if (!consignadoId) return { ok: false, message: 'Consignado não identificado.' }

    const supabase = await createServiceClient()

    // Busca consignado e itens não devolvidos
    const { data: consignado } = await supabase
      .from('consignados')
      .select('id, total, pessoa_id, pessoa_nome, itens:itens_consignado(id, nome, quantidade, devolvido, preco_unitario)')
      .eq('id', consignadoId)
      .maybeSingle()
    if (!consignado) return { ok: false, message: 'Consignado não encontrado.' }

    type ItemConsignado = { id: string; nome: string; quantidade: number; devolvido: number; preco_unitario: number }
    const itens = (consignado.itens ?? []) as ItemConsignado[]
    const itensAcertar = itens.filter((i) => (i.devolvido ?? 0) < i.quantidade)
    const totalAcerto = itensAcertar.reduce(
      (s, i) => s + (i.quantidade - (i.devolvido ?? 0)) * (i.preco_unitario ?? 0),
      0,
    )

    // Cria lancamento de recebimento se houver valor
    if (totalAcerto > 0 && formaId) {
      const { error: eLanc } = await supabase.from('lancamentos').insert({
        tipo: 'receber',
        status: 'pago',
        valor: totalAcerto,
        descricao: `Acerto consignado — ${consignado.pessoa_nome ?? 'cliente'}${obs ? ` (${obs})` : ''}`,
        pessoa_id: consignado.pessoa_id ?? null,
        pessoa_nome: consignado.pessoa_nome ?? null,
        forma_pagamento_id: formaId || null,
        data_vencimento: new Date().toISOString().split('T')[0],
      })
      if (eLanc) return { ok: false, message: eLanc.message }
    }

    // Fecha o consignado
    await supabase
      .from('consignados')
      .update({ status: 'acertado', observacoes: obs ?? undefined })
      .eq('id', consignadoId)

    revalidatePath('/painel/consignado')
    return { ok: true, message: `Acerto registrado — ${itensAcertar.length} item(ns) — R$ ${totalAcerto.toFixed(2).replace('.', ',')}` }
  } catch {
    return { ok: false, message: 'Erro ao registrar acerto.' }
  }
}
