'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Status de reparo (originais) + os do fluxo da Isa (orçamento/finalizada/não
// finalizada). 'vencida' NÃO é status guardado — é derivado da previsão vencida.
export type StatusOS = 'aguardando' | 'em_reparo' | 'aguardando_peca' | 'pronto' | 'entregue' | 'cancelado'
  | 'orcamento' | 'finalizada' | 'nao_finalizada'

export interface OrdemServico {
  id: string
  numero: number
  pessoa_nome: string | null
  pessoa_id: string | null
  aparelho: string | null
  modelo: string | null
  imei: string | null
  problema: string
  observacoes: string | null
  status: StatusOS
  total: number
  tecnico_nome: string | null
  previsao_entrega: string | null
  created_at: string
}

export async function gerarOSDePedido(pedidoId: string) {
  const usuario = await requirePermissao('os')
  const supabase = await createServiceClient()

  const { data: pedido } = await supabase
    .from('pedidos')
    .select('pessoa_id, total, referencia_cliente, observacoes')
    .eq('id', pedidoId)
    .single()
  if (!pedido) return { error: 'Pedido não encontrado' }

  let pessoaNome: string | null = null
  if (pedido.pessoa_id) {
    const { data: p } = await supabase.from('pessoas').select('nome').eq('id', pedido.pessoa_id).maybeSingle()
    pessoaNome = p?.nome ?? null
  }

  const { data: perfil } = await supabase.from('perfis').select('nome').eq('id', usuario.id).maybeSingle()
  const tecnicoNome = (perfil as { nome?: string } | null)?.nome ?? usuario.email ?? ''

  const { data: os, error } = await supabase.from('ordens_servico').insert({
    pedido_id:    pedidoId,
    pessoa_id:    pedido.pessoa_id,
    pessoa_nome:  pessoaNome,
    problema:     pedido.observacoes ?? pedido.referencia_cliente ?? 'Gerada a partir de pedido',
    tecnico_id:   usuario.id,
    tecnico_nome: tecnicoNome,
    total:        pedido.total ?? 0,
    status:       'aguardando',
  }).select('id').single()

  if (error) return { error: error.message }
  revalidatePath('/painel/os')
  redirect(`/painel/os/${os!.id}`)
}

export async function criarOS(formData: FormData) {
  const usuario = await requirePermissao('os')
  const supabase = await createServiceClient()

  const pessoaId = (formData.get('pessoa_id') as string) || null
  let pessoaNome: string | null = null
  if (pessoaId) {
    const { data: p } = await supabase.from('pessoas').select('nome').eq('id', pessoaId).maybeSingle()
    pessoaNome = p?.nome ?? null
  } else {
    pessoaNome = (formData.get('pessoa_nome') as string) || null
  }

  // técnico escolhido no form (senão o usuário logado). Isa 29/07.
  const tecnicoId = (formData.get('tecnico_id') as string) || usuario.id
  const { data: perfil } = await supabase.from('perfis').select('nome').eq('id', tecnicoId).maybeSingle()
  const tecnicoNome = (perfil as { nome?: string } | null)?.nome ?? usuario.email ?? ''
  const previsaoEntrega = (formData.get('previsao_entrega') as string) || null

  const { data: os, error } = await supabase.from('ordens_servico').insert({
    pessoa_id:    pessoaId,
    pessoa_nome:  pessoaNome,
    aparelho:     (formData.get('aparelho') as string) || null,
    modelo:       (formData.get('modelo') as string) || null,
    imei:         (formData.get('imei') as string) || null,
    problema:     formData.get('problema') as string,
    observacoes:  (formData.get('observacoes') as string) || null,
    tecnico_id:   tecnicoId,
    tecnico_nome: tecnicoNome,
    previsao_entrega: previsaoEntrega,
    status:       'aguardando',
  }).select('id').single()

  if (error) return { error: error.message }
  revalidatePath('/painel/os')
  redirect(`/painel/os/${os!.id}`)
}

export async function atualizarStatusOS(osId: string, status: StatusOS) {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('ordens_servico').update({ status }).eq('id', osId)
  if (error) return { error: error.message }
  revalidatePath('/painel/os')
  revalidatePath(`/painel/os/${osId}`)
  return { ok: true }
}

export async function buscarClientesOS(busca: string) {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('pessoas')
    .select('id, nome, telefone')
    .ilike('nome', `%${busca}%`)
    .limit(10)
  return (data ?? []) as { id: string; nome: string; telefone: string | null }[]
}
