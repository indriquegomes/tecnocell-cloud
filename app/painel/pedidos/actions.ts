'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { logAtividade } from '@/lib/log-atividade'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Busca de cliente SOB DEMANDA pro form de pedido (não embutir 2.397 num select
// capado em 500 que sumia cliente). Só dígitos → CPF/telefone; senão nome_norm.
export async function buscarClientesPedido(
  accessToken: string,
  termo: string,
): Promise<{ id: string; nome: string }[]> {
  await requirePermissao('pedidos', accessToken)
  const raw = termo.trim()
  if (raw.length < 1) return []
  const supabase = await createServiceClient()
  let q = supabase.from('pessoas').select('id, nome').eq('ativo', true).in('tipo', ['cliente', 'ambos'])
  const digitos = raw.replace(/\D/g, '')
  const soDigitos = digitos.length >= 4 && /^[\d.\-/()\s]+$/.test(raw)
  if (soDigitos) {
    q = q.or(`cpf_cnpj.ilike.%${digitos}%,telefone.ilike.%${digitos}%,celular.ilike.%${digitos}%`)
  } else {
    const semAcento = raw.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
    const palavras = semAcento.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
    if (palavras.length === 0) return []
    for (const w of palavras) q = q.ilike('nome_norm', `%${w}%`)
  }
  const { data } = await q.order('nome').limit(15)
  return data ?? []
}

export async function criarPedido(formData: FormData) {
  const usuario = await requirePermissao('pedidos')
  const supabase = await createServiceClient()

  // Captura nome do vendedor
  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', usuario.id)
    .maybeSingle()
  const vendedorNome = (perfil as { nome?: string } | null)?.nome ?? usuario.email ?? ''

  const { data: pedido, error } = await supabase.from('pedidos').insert({
    tipo:               formData.get('tipo') as string,
    pessoa_id:          (formData.get('pessoa_id') as string) || null,
    observacoes:        (formData.get('observacoes') as string) || null,
    data_validade:      (formData.get('data_validade') as string) || null,
    deposito_id:        (formData.get('deposito_id') as string) || null,
    tabela_preco_id:    (formData.get('tabela_preco_id') as string) || null,
    forma_pagamento_id: (formData.get('forma_pagamento_id') as string) || null,
    origem:             (formData.get('origem') as string) || 'balcao',
    vendedor_id:        usuario.id,
    vendedor_nome:      vendedorNome,
    status: 'rascunho',
    total: 0,
  }).select('id').single()
  if (error) redirect(`/painel/pedidos/novo?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/pedidos')
  redirect(`/painel/pedidos/${pedido!.id}`)
}

export async function atualizarStatusPedido(id: string, status: string) {
  await requirePermissao('pedidos')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/pedidos')
  revalidatePath(`/painel/pedidos/${id}`)
}

export async function deletarPedido(id: string) {
  await requirePermissao('pedidos')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/pedidos')
}

// Faturar pedido → cria a venda de verdade (baixa estoque + fiado) via o mesmo
// RPC do PDV. Retorna {ok,msg}. Aparelho com IMEI vai pelo PDV (precisa escolher série).
export async function faturarPedido(id: string): Promise<{ ok: boolean; msg: string; vendaNumero?: number | null }> {
  const usuario = await requirePermissao('pedidos')
  const supabase = await createServiceClient()

  const { data: pedido } = await supabase.from('pedidos')
    .select('id, status, desconto, deposito_id, forma_pagamento_id, pessoa_id, vendedor_id, vendedor_nome, observacoes')
    .eq('id', id).single()
  if (!pedido) return { ok: false, msg: 'Pedido não encontrado.' }
  if (pedido.status === 'faturado') return { ok: false, msg: 'Este pedido já foi faturado.' }
  if (pedido.status === 'cancelado') return { ok: false, msg: 'Pedido cancelado não pode ser faturado.' }
  if (!pedido.deposito_id) return { ok: false, msg: 'Defina o depósito no pedido antes de faturar.' }
  if (!pedido.forma_pagamento_id) return { ok: false, msg: 'Defina a forma de pagamento no pedido antes de faturar.' }

  const { data: itens } = await supabase.from('itens_pedido')
    .select('produto_id, quantidade, preco_unitario, total_item, produtos(nome, controla_serie)')
    .eq('pedido_id', id)
  const lista = (itens ?? []) as unknown as { produto_id: string; quantidade: number; preco_unitario: number; total_item: number | null; produtos: { nome: string; controla_serie: boolean | null } | null }[]
  if (lista.length === 0) return { ok: false, msg: 'Pedido sem itens.' }
  if (lista.some((i) => i.produtos?.controla_serie)) {
    return { ok: false, msg: 'Tem aparelho com IMEI. Fature pelo botão "Abrir no PDV" pra escolher a série.' }
  }

  const { data: forma } = await supabase.from('formas_pagamento').select('tipo, nome').eq('id', pedido.forma_pagamento_id).maybeSingle()
  const isFiado = (forma?.tipo === 'credito_loja') || /fiado/i.test(forma?.nome ?? '')

  const desconto = pedido.desconto ?? 0
  const totalItens = lista.reduce((s, i) => s + (i.total_item ?? i.preco_unitario * i.quantidade), 0)
  const total = Math.max(0, totalItens - desconto)

  // Trava atômica: marca 'faturado' ANTES de criar a venda. Se dois cliques
  // caírem juntos, só um consegue (o outro não acha linha pra atualizar).
  const { data: marcado, error: eStatus } = await supabase.from('pedidos')
    .update({ status: 'faturado' })
    .eq('id', id).neq('status', 'faturado').neq('status', 'cancelado')
    .select('id').maybeSingle()
  if (eStatus) return { ok: false, msg: 'Não deu pra marcar como faturado (rode a migration 2026-08-01). ' + eStatus.message }
  if (!marcado) return { ok: false, msg: 'Este pedido já foi faturado ou está cancelado.' }

  const { data, error } = await supabase.rpc('finalizar_venda', {
    p_itens: lista.map((i) => ({ produto_id: i.produto_id, nome: i.produtos?.nome ?? '', quantidade: i.quantidade, preco_unitario: i.preco_unitario })),
    p_pagamentos: [{ forma_pagamento_id: pedido.forma_pagamento_id, valor: total, taxa: 0, maquina: '', parcelas: 1, status: isFiado ? 'pendente' : 'pago' }],
    p_pessoa_id: pedido.pessoa_id,
    p_desconto: desconto,
    p_observacoes: `Faturado do pedido${pedido.observacoes ? ' — ' + pedido.observacoes : ''}`,
    p_deposito_id: pedido.deposito_id,
    p_series: [],
    p_vendedor_id: pedido.vendedor_id ?? usuario.id,
    p_vendedor_nome: pedido.vendedor_nome ?? usuario.email ?? '',
    p_credito_valor: 0,
  })
  if (error) {
    // venda falhou → devolve o pedido pro status anterior
    await supabase.from('pedidos').update({ status: pedido.status }).eq('id', id)
    return { ok: false, msg: error.message }
  }

  await logAtividade('pedido.faturar', {
    pedido_id: id,
    venda_id: data?.venda_id ?? null,
    venda_numero: data?.venda_numero ?? null,
    deposito_id: pedido.deposito_id,
    forma_pagamento_id: pedido.forma_pagamento_id,
  }, usuario, `/painel/pedidos/${id}`)

  revalidatePath('/painel/pedidos')
  revalidatePath(`/painel/pedidos/${id}`)
  return { ok: true, msg: 'Pedido faturado!', vendaNumero: (data?.venda_numero ?? null) as number | null }
}

export async function adicionarItemPedido(pedidoId: string, formData: FormData) {
  await requirePermissao('pedidos')
  const supabase = await createServiceClient()
  const quantidade = Math.round(parseFloat(formData.get('quantidade') as string)) || 1
  const preco = parseFloat(formData.get('preco_unitario') as string) || 0
  const total = quantidade * preco

  const { error } = await supabase.from('itens_pedido').insert({
    pedido_id: pedidoId,
    produto_id: formData.get('produto_id') as string,
    quantidade,
    preco_unitario: preco,
    total_item: total,
  })
  if (error) return { error: error.message }

  const { data: ped } = await supabase.from('pedidos').select('desconto, frete').eq('id', pedidoId).single()
  const { data: itens } = await supabase.from('itens_pedido').select('total_item').eq('pedido_id', pedidoId)
  const subtotal = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const novoTotal = Math.max(0, subtotal - (ped?.desconto ?? 0) + (ped?.frete ?? 0))
  await supabase.from('pedidos').update({ total: novoTotal }).eq('id', pedidoId)

  revalidatePath(`/painel/pedidos/${pedidoId}`)
  return { ok: true }
}

export async function atualizarDescontoFrete(id: string, desconto: number, frete: number) {
  await requirePermissao('pedidos')
  const supabase = await createServiceClient()
  // recalcula total com os itens existentes
  const { data: itens } = await supabase.from('itens_pedido').select('total_item').eq('pedido_id', id)
  const subtotal = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const total = Math.max(0, subtotal - desconto + frete)
  const { error } = await supabase.from('pedidos').update({ desconto, frete, total }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/painel/pedidos/${id}`)
  return { ok: true }
}

export async function atualizarInfoPedido(
  id: string,
  dados: { deposito_id?: string | null; forma_pagamento_id?: string | null; origem?: string | null }
) {
  await requirePermissao('pedidos')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').update(dados).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/painel/pedidos/${id}`)
  return { ok: true }
}

export async function atualizarObservacoesTermos(
  id: string,
  dados: { observacoes?: string | null; termos_condicoes?: string | null }
) {
  await requirePermissao('pedidos')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos').update(dados).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/painel/pedidos/${id}`)
  return { ok: true }
}

export async function cancelarComMotivo(id: string, motivo: string) {
  await requirePermissao('pedidos')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('pedidos')
    .update({ status: 'cancelado', motivo_cancelamento: motivo || null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/painel/pedidos')
  revalidatePath(`/painel/pedidos/${id}`)
  return { ok: true }
}

export async function removerItemPedido(itemId: string, pedidoId: string) {
  await requirePermissao('pedidos')
  const supabase = await createServiceClient()
  await supabase.from('itens_pedido').delete().eq('id', itemId)
  const { data: ped } = await supabase.from('pedidos').select('desconto, frete').eq('id', pedidoId).single()
  const { data: itens } = await supabase.from('itens_pedido').select('total_item').eq('pedido_id', pedidoId)
  const subtotal = itens?.reduce((s, i) => s + (i.total_item ?? 0), 0) ?? 0
  const novoTotal = Math.max(0, subtotal - (ped?.desconto ?? 0) + (ped?.frete ?? 0))
  await supabase.from('pedidos').update({ total: novoTotal }).eq('id', pedidoId)
  revalidatePath(`/painel/pedidos/${pedidoId}`)
}

// Traz pedido(s)+itens dos IDs selecionados na lista, no formato do documento
// imprimível (usado pela barra de ações: Imprimir A4/Cupom, PDF, WhatsApp).
import type { PedidoImpr } from '@/components/DocumentoPedido'
export async function carregarPedidosImpressao(accessToken: string, ids: string[]): Promise<PedidoImpr[]> {
  await requirePermissao('pedidos', accessToken)
  if (!ids.length) return []
  ids = ids.slice(0, 100) // trava: .in() com centenas de ids estoura a URL do PostgREST
  const supabase = await createServiceClient()
  const [{ data: peds }, { data: itens }] = await Promise.all([
    supabase.from('pedidos')
      .select('id, numero, tipo, pessoa_id, vendedor_nome, created_at, data_validade, referencia_cliente, observacoes, desconto, frete')
      .in('id', ids),
    supabase.from('itens_pedido')
      .select('id, pedido_id, produto_id, quantidade, preco_unitario, total_item')
      .in('pedido_id', ids),
  ])
  const prodIds = [...new Set((itens ?? []).map((i) => i.produto_id))]
  const nomeProd: Record<string, string> = {}
  if (prodIds.length) {
    const { data: prods } = await supabase.from('produtos').select('id, nome').in('id', prodIds)
    for (const p of prods ?? []) nomeProd[p.id] = p.nome
  }
  const pesIds = [...new Set((peds ?? []).map((p) => p.pessoa_id).filter(Boolean))] as string[]
  const nomePes: Record<string, string> = {}
  if (pesIds.length) {
    const { data: pes } = await supabase.from('pessoas').select('id, nome').in('id', pesIds)
    for (const p of pes ?? []) nomePes[p.id] = p.nome
  }
  // preserva a ordem dos ids selecionados
  const byId = new Map((peds ?? []).map((p) => [p.id, p]))
  return ids.filter((id) => byId.has(id)).map((id) => {
    const p = byId.get(id)!
    return {
      id: p.id, numero: p.numero, tipo: p.tipo,
      pessoa_nome: p.pessoa_id ? (nomePes[p.pessoa_id] ?? null) : null,
      vendedor_nome: p.vendedor_nome ?? null,
      created_at: p.created_at, data_validade: p.data_validade ?? null,
      referencia_cliente: p.referencia_cliente ?? null, observacoes: p.observacoes ?? null,
      desconto: p.desconto ?? 0, frete: p.frete ?? 0,
      itens: (itens ?? []).filter((i) => i.pedido_id === p.id).map((i) => ({
        id: i.id, quantidade: i.quantidade, preco_unitario: i.preco_unitario,
        total_item: i.total_item ?? 0, nome: nomeProd[i.produto_id] ?? 'Produto',
      })),
    }
  })
}

// Igual à de cima, mas pras VENDAS do PDV (tabela itens_venda). Mapeia pro mesmo
// documento imprimível (venda não tem frete/validade/ref).
export async function carregarVendasImpressao(accessToken: string, ids: string[]): Promise<PedidoImpr[]> {
  await requirePermissao('pedidos', accessToken)
  if (!ids.length) return []
  ids = ids.slice(0, 100) // trava: .in() com centenas de ids estoura a URL do PostgREST
  const supabase = await createServiceClient()
  const [{ data: vendas }, { data: itensRaw }] = await Promise.all([
    supabase.from('vendas').select('id, numero, pessoa_id, vendedor_nome, created_at, observacoes, desconto').in('id', ids),
    supabase.from('itens_venda').select('id, venda_id, quantidade, preco_unitario, total_item, produtos(nome)').in('venda_id', ids),
  ])
  const itens = (itensRaw ?? []) as unknown as { id: string | null; venda_id: string; quantidade: number; preco_unitario: number; total_item: number | null; produtos: { nome: string } | null }[]
  const pesIds = [...new Set((vendas ?? []).map((v) => v.pessoa_id).filter(Boolean))] as string[]
  const nomePes: Record<string, string> = {}
  if (pesIds.length) { const { data: pes } = await supabase.from('pessoas').select('id, nome').in('id', pesIds); for (const p of pes ?? []) nomePes[p.id] = p.nome }
  const byId = new Map((vendas ?? []).map((v) => [v.id, v]))
  return ids.filter((id) => byId.has(id)).map((id) => {
    const v = byId.get(id)!
    return {
      id: v.id, numero: v.numero, tipo: 'venda',
      pessoa_nome: v.pessoa_id ? (nomePes[v.pessoa_id] ?? null) : null,
      vendedor_nome: v.vendedor_nome ?? null,
      created_at: v.created_at, data_validade: null, referencia_cliente: null,
      observacoes: v.observacoes ?? null, desconto: v.desconto ?? 0, frete: 0,
      itens: itens.filter((i) => i.venda_id === id).map((i, idx) => ({
        id: i.id ?? `${id}-${idx}`, quantidade: i.quantidade, preco_unitario: i.preco_unitario,
        total_item: i.total_item ?? (i.quantidade * i.preco_unitario), nome: i.produtos?.nome ?? 'Produto',
      })),
    }
  })
}
