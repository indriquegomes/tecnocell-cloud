'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { registrarNoCaixa } from '@/lib/caixa'
import { hojeSP } from '@/lib/utils'
import { aplicaBusca, palavrasBusca } from '@/lib/busca-produtos'

// Tabela de preço ATACADO1 — é o valor de venda inicial da encomenda (pedido do dono).
const ATACADO1_ID = '74f5fea6-cbc9-4f12-8702-27c54eb9ff88'

// Busca produtos + preço ATACADO1 (pra preencher o valor de venda da encomenda).
export async function buscarProdutosEncomenda(termo: string) {
  await requirePermissao('pdv')
  const supabase = await createServiceClient()
  const palavras = palavrasBusca(termo)
  if (palavras.length === 0) return []
  let q = supabase.from('produtos').select('id, nome, preco').eq('ativo', true)
  q = aplicaBusca(q, 'busca_norm', palavras)
  let { data, error } = await q.order('nome').limit(8)
  if (error && (error.code === '42703' || error.message?.includes('busca_norm'))) {
    let f = supabase.from('produtos').select('id, nome, preco').eq('ativo', true)
    for (const w of palavras) f = f.ilike('nome', `%${w}%`)
    ;({ data } = await f.order('nome').limit(8))
  }
  const produtos = (data ?? []) as { id: string; nome: string; preco: number | null }[]
  const ids = produtos.map((p) => p.id)
  const { data: itens } = ids.length
    ? await supabase.from('itens_tabela_preco').select('produto_id, preco').eq('tabela_id', ATACADO1_ID).in('produto_id', ids)
    : { data: [] }
  const atacado = new Map(((itens ?? []) as { produto_id: string; preco: number | null }[]).map((i) => [i.produto_id, Number(i.preco) || 0]))
  return produtos.map((p) => ({ id: p.id, nome: p.nome, atacado1: atacado.get(p.id) ?? Number(p.preco) ?? 0 }))
}

// Busca cliente (pra ligar a encomenda ao cadastro — o vale do sinal precisa de pessoa_id).
export async function buscarPessoasEncomenda(termo: string) {
  await requirePermissao('pdv')
  const supabase = await createServiceClient()
  const q = termo.trim()
  if (!q) return []
  const { data } = await supabase.from('pessoas')
    .select('id, nome, telefone')
    .ilike('nome', `%${q}%`)
    .eq('ativo', true)
    .order('nome')
    .limit(8)
  return (data ?? []) as { id: string; nome: string; telefone: string | null }[]
}

// Cria a encomenda. Sinal (se houver): entra no caixa + vira vale NORMAL no cliente
// (não fica preso à encomenda — se a peça não chegar, o cliente usa em qualquer coisa).
export async function criarEncomenda(formData: FormData) {
  await requirePermissao('pdv')
  const supabase = await createServiceClient()

  const pessoa_id = (formData.get('pessoa_id') as string) || null
  const pessoa_nome = ((formData.get('pessoa_nome') as string) || '').trim()
  const produto_id = (formData.get('produto_id') as string) || null
  const item_nome = ((formData.get('item_nome') as string) || '').trim()
  const temporario = formData.get('temporario') === '1'
  const quantidade = Number(formData.get('quantidade') || 0)
  const valor_venda = Number(formData.get('valor_venda') || 0) || null
  const sinal = Number(formData.get('sinal') || 0)
  const sinal_forma = (formData.get('sinal_forma') as string) || null
  const loja_id = (formData.get('loja_id') as string) || null
  const observacoes = ((formData.get('observacoes') as string) || '').trim() || null

  if (!pessoa_nome || !item_nome || quantidade <= 0) return { erro: 'Preencha cliente, item e quantidade.' }
  if (!loja_id) return { erro: 'Escolha a loja da encomenda.' }
  if (sinal > 0 && !sinal_forma) return { erro: 'Escolha a forma do sinal.' }

  const { data: enc, error: eEnc } = await supabase.from('encomendas').insert({
    pessoa_id, pessoa_nome, produto_id, item_nome, temporario,
    quantidade, valor_venda, sinal, sinal_forma: sinal > 0 ? sinal_forma : null,
    status: 'aberta', loja_id, observacoes,
  }).select('id').single()
  if (eEnc) return { erro: 'Não deu pra criar a encomenda: ' + eEnc.message }
  const encomendaId = (enc as { id: string }).id

  if (sinal > 0) {
    const hoje = hojeSP()
    const desc = `Sinal encomenda ${item_nome} — ${pessoa_nome}`
    // O sinal é receita de encomenda, não venda fechada: nasce classificado como
    // "Combinado na entrega › Sinal" (antes nascia SEM categoria e ia para o balde
    // "Sem categoria" do financeiro).
    const { error: eLanc } = await supabase.from('lancamentos').insert({
      id: crypto.randomUUID(),
      descricao: desc, valor: sinal, tipo: 'receber', status: 'pago',
      categoria: 'Combinado na entrega', subcategoria: 'Sinal',
      data_competencia: hoje, data_vencimento: hoje, data_pagamento: hoje,
      forma_pagamento: sinal_forma, pessoa_nome, pessoa_id, loja_id,
    })
    if (eLanc) return { erro: 'Sinal não registrou no financeiro: ' + eLanc.message }
    await registrarNoCaixa(supabase, loja_id, sinal, sinal_forma || 'Sinal', desc)
    const { error: eVale } = await supabase.from('creditos_clientes').insert({
      pessoa_id, pessoa_nome, valor: sinal, tipo: 'credito', descricao: desc, loja_id,
    })
    if (eVale) return { erro: 'Sinal não virou vale: ' + eVale.message }
  }

  revalidatePath('/painel/pdv')
  revalidatePath('/painel/estoque/encomendas')
  return { ok: true as const, id: encomendaId }
}

// Marca que a estoquista COMPROU a peça no fornecedor — vira "aguardando chegada".
export async function marcarComprada(encomendaId: string) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  await supabase.from('encomendas').update({ status: 'comprada' }).eq('id', encomendaId)
  revalidatePath('/painel/compras')
  revalidatePath('/painel/estoque/encomendas')
  return { ok: true as const }
}

// Aprova quando a peça chega: marca a encomenda como 'aprovada' e guarda o custo
// pago, e nada mais.
//
// NÃO cadastra produto e NÃO dá entrada no estoque, de propósito. A entrada da peça
// é a NOTA DE ENTRADA: ela passa pelo RPC `receber_nota_entrada`, grava movimentação
// e recalcula o custo pela média ponderada. Cadastrar aqui nascia do texto livre da
// encomenda (produto duplicado, com nome torto e preço solto) e somar estoque aqui
// contava a mesma peça duas vezes quando a nota chegava.
export async function aprovarEncomenda(encomendaId: string, custo: number) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  const { error: eEnc } = await supabase.from('encomendas')
    .update({ status: 'aprovada', custo, aprovado_em: new Date().toISOString() })
    .eq('id', encomendaId)
  if (eEnc) return { erro: 'Não deu pra marcar como aprovada: ' + eEnc.message }

  revalidatePath('/painel/compras')
  revalidatePath('/painel/estoque/encomendas')
  return { ok: true as const }
}

// Rejeita a encomenda (peça não chegou / cliente desistiu).
export async function rejeitarEncomenda(encomendaId: string) {
  await requirePermissao('compras')
  const supabase = await createServiceClient()
  await supabase.from('encomendas').update({ status: 'cancelada' }).eq('id', encomendaId)
  revalidatePath('/painel/compras')
  revalidatePath('/painel/estoque/encomendas')
  return { ok: true as const }
}

// Cancela a encomenda direto da lista do Estoque (cliente desistiu).
export async function cancelarEncomenda(encomendaId: string) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  await supabase.from('encomendas').update({ status: 'cancelada' }).eq('id', encomendaId)
  revalidatePath('/painel/estoque/encomendas')
  revalidatePath('/painel/compras')
  return { ok: true as const }
}

