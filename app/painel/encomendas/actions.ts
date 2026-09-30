'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { registrarNoCaixa } from '@/lib/caixa'
import { hojeSP } from '@/lib/utils'

// Tabela de preço ATACADO1 — é o valor de venda inicial da encomenda (pedido do dono).
const ATACADO1_ID = '74f5fea6-cbc9-4f12-8702-27c54eb9ff88'

// Busca produtos + preço ATACADO1 (pra preencher o valor de venda da encomenda).
export async function buscarProdutosEncomenda(termo: string) {
  await requirePermissao('pdv')
  const supabase = await createServiceClient()
  const q = termo.trim()
  if (!q) return []
  const { data } = await supabase.from('produtos')
    .select('id, nome, preco')
    .ilike('nome', `%${q}%`)
    .eq('ativo', true)
    .order('nome')
    .limit(8)
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
    const desc = `Sinal encomenda ${item_nome}`
    const { error: eLanc } = await supabase.from('lancamentos').insert({
      id: crypto.randomUUID(),
      descricao: desc, valor: sinal, tipo: 'receber', status: 'pago',
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

