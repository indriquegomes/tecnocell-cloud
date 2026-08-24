'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { registrarNoCaixa } from '@/lib/caixa'
import { hojeSP } from '@/lib/utils'
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
  custo: number
  tecnico_nome: string | null
  previsao_entrega: string | null
  recebido_em: string | null
  forma_recebimento: string | null
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
    pessoa_id:    pedido.pessoa_id,
    pessoa_nome:  pessoaNome,
    equipamento:  'Serviço (do pedido)',
    defeito_relatado: pedido.observacoes ?? pedido.referencia_cliente ?? 'Gerada a partir de pedido',
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
    equipamento:  (formData.get('aparelho') as string) || 'Não informado',
    modelo:       (formData.get('modelo') as string) || null,
    serial_imei:  (formData.get('imei') as string) || null,
    defeito_relatado: (formData.get('problema') as string) || 'Não informado',
    observacoes:  (formData.get('observacoes') as string) || null,
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

export async function atualizarValoresOS(osId: string, total: number, custo: number): Promise<{ ok: boolean }> {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  await supabase.from('ordens_servico').update({ total: Math.max(0, total), custo: Math.max(0, custo) }).eq('id', osId)
  revalidatePath('/painel/os')
  revalidatePath(`/painel/os/${osId}`)
  return { ok: true }
}

// Recebimento da OS: dinheiro entra no caixa da loja + lançamento pago na conta
// da forma (mesma mecânica do recebimento de fiado). Trava contra receber 2x.
type SBOS = Awaited<ReturnType<typeof createServiceClient>>
async function contaDaFormaOS(supabase: SBOS, texto: string, lojaId?: string | null): Promise<string | null> {
  const t = (texto || '').trim().toLowerCase()
  if (!t) return null
  const { data } = await supabase.from('formas_pagamento').select('nome, tipo, conta_destino_id')
  const f = (data ?? []).find((x) => (x.nome ?? '').toLowerCase() === t || (x.tipo ?? '').toLowerCase() === t)
  if (!f) return null
  // Dinheiro sempre cai no CAIXA DA LOJA, mesma regra de contaDaFormaTexto
  // (pdv/actions.ts) e de lib/saldos-contas.ts — sem isto caía na conta
  // bancária inativa "Dinheiro (antigo)".
  if (f.tipo === 'dinheiro' && lojaId) {
    const { data: caixa } = await supabase.from('contas').select('id').eq('tipo', 'caixa').eq('loja_id', lojaId).maybeSingle()
    if (caixa) return caixa.id
  }
  return (f.conta_destino_id as string | null) ?? null
}

// Busca OS por número pra receber no PDV (Opção B). Só as ainda NÃO recebidas.
export async function buscarOSPorNumero(numero: number): Promise<{ id: string; numero: number; pessoa_nome: string | null; equipamento: string | null; total: number; recebido_em: string | null } | null> {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  const { data } = await supabase.from('ordens_servico')
    .select('id, numero, pessoa_nome, equipamento, total, recebido_em')
    .eq('numero', numero).maybeSingle()
  if (!data) return null
  return { ...data, total: Number(data.total) || 0 } as { id: string; numero: number; pessoa_nome: string | null; equipamento: string | null; total: number; recebido_em: string | null }
}

export async function receberOS(osId: string, forma: string, lojaId: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  const { data: os } = await supabase.from('ordens_servico').select('numero, total, pessoa_nome, status, recebido_em').eq('id', osId).maybeSingle()
  if (!os) return { ok: false, erro: 'OS não encontrada.' }
  if ((os as { recebido_em?: string | null }).recebido_em) return { ok: false, erro: 'Esta OS já foi recebida.' }
  const total = Number(os.total) || 0
  if (total <= 0) return { ok: false, erro: 'Defina o valor da OS antes de receber.' }
  if (!forma) return { ok: false, erro: 'Escolha a forma de pagamento.' }
  if (!lojaId) return { ok: false, erro: 'Escolha a loja do recebimento.' }

  const today = hojeSP()
  const now = new Date().toISOString()
  const statusAnterior = (os as { status: string }).status

  // Trava atômica: marca 'entregue' ANTES de lançar o dinheiro, condicionado a
  // ainda não ter recebido_em. Se dois cliques caírem juntos, só um consegue
  // (o outro não acha linha pra atualizar) — mesmo padrão do faturarPedido,
  // que existe pra isso. Sem essa trava, os dois passavam pela checagem acima
  // e duplicavam o lançamento no Financeiro.
  const { data: marcado, error: eStatus } = await supabase.from('ordens_servico')
    .update({ recebido_em: now, forma_recebimento: forma, status: 'entregue' })
    .eq('id', osId).is('recebido_em', null)
    .select('id').maybeSingle()
  if (eStatus) return { ok: false, erro: 'Não deu pra marcar como recebida: ' + eStatus.message }
  if (!marcado) return { ok: false, erro: 'Esta OS já foi recebida.' }

  // Caixa é fire-and-forget por design (lib/caixa.ts): dinheiro já entrou de
  // verdade na gaveta, travar o recebimento por causa disso seria pior.
  await registrarNoCaixa(supabase, lojaId, total, forma, `Recebimento OS #${os.numero}`)

  // O lançamento É o registro oficial no Financeiro — se ele falhar, desfaz a
  // marca de recebida pra não ficar "entregue" sem o dinheiro registrado, e
  // deixa a pessoa tentar de novo.
  const { error: eLancamento } = await supabase.from('lancamentos').insert({
    descricao: `Recebimento OS #${os.numero}`, valor: total, tipo: 'receber',
    status: 'pago', data_competencia: today, data_vencimento: today, data_pagamento: today,
    forma_pagamento: forma, pessoa_nome: (os as { pessoa_nome?: string | null }).pessoa_nome ?? null,
    conta_id: await contaDaFormaOS(supabase, forma, lojaId),
  })
  if (eLancamento) {
    await supabase.from('ordens_servico').update({ recebido_em: null, forma_recebimento: null, status: statusAnterior }).eq('id', osId)
    return { ok: false, erro: 'Não deu pra registrar o lançamento no Financeiro: ' + eLancamento.message }
  }

  revalidatePath('/painel/os')
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

export async function criarClienteRapidoOS(nome: string): Promise<{ ok: true; id: string; nome: string } | { ok: false; erro: string }> {
  await requirePermissao('os')
  const limpo = nome.trim()
  if (limpo.length < 2) return { ok: false, erro: 'Nome muito curto.' }
  const supabase = await createServiceClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('pessoas').insert({ id, nome: limpo, tipo: 'cliente', pessoa_fisica: true, ativo: true })
  if (error) return { ok: false, erro: error.message }
  return { ok: true, id, nome: limpo }
}

// ── Check-lists aplicados numa OS (Etapa 4) ──────────────────────────────────
export type ItemChecklist = { texto: string; ok: boolean }
export type ChecklistOS = { id: string; nome: string; itens: ItemChecklist[] }

export async function listarChecklistsOS(osId: string): Promise<ChecklistOS[]> {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  const { data } = await supabase.from('os_checklists').select('id, nome, itens').eq('os_id', osId).order('created_at')
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, itens: (c.itens ?? []) as ItemChecklist[] }))
}

export async function aplicarChecklistOS(osId: string, modeloId: string): Promise<{ ok: boolean } | { error: string }> {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  const { data: modelo } = await supabase.from('checklists_modelo').select('nome, itens').eq('id', modeloId).maybeSingle()
  if (!modelo) return { error: 'Modelo não encontrado.' }
  const itens: ItemChecklist[] = ((modelo.itens ?? []) as string[]).map((texto) => ({ texto, ok: false }))
  const { error } = await supabase.from('os_checklists').insert({ os_id: osId, nome: modelo.nome, itens })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function salvarChecklistOS(id: string, itens: ItemChecklist[]): Promise<{ ok: boolean }> {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  await supabase.from('os_checklists').update({ itens }).eq('id', id)
  return { ok: true }
}

export async function removerChecklistOS(id: string): Promise<{ ok: boolean }> {
  await requirePermissao('os')
  const supabase = await createServiceClient()
  await supabase.from('os_checklists').delete().eq('id', id)
  return { ok: true }
}
