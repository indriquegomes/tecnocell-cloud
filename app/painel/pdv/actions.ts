'use server'

import { createServiceClient } from '@/lib/supabase/server'

interface ItemCarrinho {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
}

export interface PagamentoInput {
  forma_pagamento_id: string
  valor: number
  taxa: number
  maquina: string
  parcelas: number
  status: 'pago' | 'pendente'
}

export async function finalizarVenda(
  itens: ItemCarrinho[],
  pagamentos: PagamentoInput[],
  pessoa_id: string | null,
  desconto: number,
  observacoes: string,
  deposito_id: string = '',
) {
  if (itens.length === 0) throw new Error('Carrinho vazio')
  if (!deposito_id) throw new Error('Depósito não selecionado')
  if (pagamentos.length === 0) throw new Error('Selecione a forma de pagamento')

  const supabase = await createServiceClient()

  const { data, error } = await supabase.rpc('finalizar_venda', {
    p_itens: itens,
    p_pagamentos: pagamentos,
    p_pessoa_id: pessoa_id,
    p_desconto: desconto,
    p_observacoes: observacoes || null,
    p_deposito_id: deposito_id,
  })

  if (error) throw new Error(error.message)

  return {
    vendaId: data.venda_id as string,
    total: data.total as number,
    estoqueAtualizado: data.estoque_atualizado as Record<string, number>,
  }
}

export interface CrediarioItem {
  id: string
  descricao: string
  valor: number
  pessoa_nome: string | null
  data_vencimento: string | null
  created_at: string
}

export async function buscarCrediario(): Promise<CrediarioItem[]> {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, descricao, valor, pessoa_nome, data_vencimento, created_at')
    .eq('tipo', 'receber')
    .eq('status', 'pendente')
    .order('data_vencimento', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CrediarioItem[]
}

export async function pagarLancamentos(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const supabase = await createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('lancamentos')
    .update({ status: 'pago', data_pagamento: today, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Pagamento não registrado — sem permissão ou lançamento não encontrado.')
}

export interface VendaResumo {
  id: string
  total: number
  desconto: number
  created_at: string
  forma_pagamento_id: string | null
  pessoa_id: string | null
}

// Buscar as últimas vendas concluídas para consulta no PDV (#9 Buscar Vendas)
export async function buscarVendas(limite: number = 30): Promise<VendaResumo[]> {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('vendas')
    .select('id, total, desconto, created_at, forma_pagamento_id, pessoa_id')
    .eq('status', 'concluida')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw new Error(error.message)
  return (data ?? []) as VendaResumo[]
}
