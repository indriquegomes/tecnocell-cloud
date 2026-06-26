'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ActionState = { ok: boolean; message: string } | null

export async function buscarClientesConsignado(busca: string) {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('pessoas')
    .select('id, nome, telefone')
    .ilike('nome', `%${busca}%`)
    .limit(8)
  return (data ?? []) as { id: string; nome: string; telefone: string | null }[]
}

export async function buscarProdutosConsignado(busca: string) {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('produtos')
    .select('id, nome, preco')
    .eq('ativo', true)
    .ilike('nome', `%${busca}%`)
    .limit(8)
  return (data ?? []) as { id: string; nome: string; preco: number }[]
}

export async function criarConsignado(formData: FormData): Promise<ActionState> {
  try {
    await requireAuth()
    const supabase = await createServiceClient()

    const pessoaId = (formData.get('pessoa_id') as string) || null
    const pessoaNome = (formData.get('pessoa_nome') as string) || null
    const observacoes = (formData.get('observacoes') as string) || null
    const depositoId = (formData.get('deposito_id') as string) || null

    const itensJson = formData.get('itens') as string
    const itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number }[] = JSON.parse(itensJson || '[]')
    if (itens.length === 0) return { ok: false, message: 'Adicione pelo menos um item.' }

    const total = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
    const id = crypto.randomUUID()

    const { error: eC } = await supabase.from('consignados').insert({
      id, pessoa_id: pessoaId, pessoa_nome: pessoaNome,
      deposito_id: depositoId, observacoes, total, status: 'aberto',
    })
    if (eC) return { ok: false, message: eC.message }

    const { error: eI } = await supabase.from('itens_consignado').insert(
      itens.map(i => ({
        consignado_id: id,
        produto_id: i.produto_id,
        nome: i.nome,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        devolvido: 0,
      }))
    )
    if (eI) return { ok: false, message: eI.message }

    revalidatePath('/painel/consignado')
    return { ok: true, message: 'Saída consignada registrada!' }
  } catch (e) {
    return { ok: false, message: 'Erro ao criar consignado.' }
  }
}

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
        const { error: eUpd } = await supabase
          .from('itens_consignado')
          .update({ devolvido: novoDevolvido })
          .eq('id', item.id)
        if (eUpd) return { ok: false, message: `Erro ao atualizar item: ${eUpd.message}` }
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

    const { error: eStatus } = await supabase
      .from('consignados')
      .update({ status: novoStatus })
      .eq('id', consignadoId)
    if (eStatus) return { ok: false, message: eStatus.message }

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
