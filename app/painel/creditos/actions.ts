'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'

export interface MovimentoCredito {
  id: string
  tipo: 'credito' | 'uso' | 'estorno'
  valor: number
  descricao: string | null
  created_at: string
}

export async function buscarSaldoCredito(
  accessToken: string,
  pessoaId: string,
): Promise<{ saldo: number; movimentos: MovimentoCredito[] }> {
  await requirePermissao('financeiro', accessToken)
  const supabase = await createServiceClient()

  const { data } = await supabase
    .from('creditos_clientes')
    .select('id, tipo, valor, descricao, created_at')
    .eq('pessoa_id', pessoaId)
    .order('created_at', { ascending: false })
    .limit(50)

  const movimentos = (data ?? []) as MovimentoCredito[]
  const saldo = movimentos.reduce((s, m) => {
    if (m.tipo === 'uso') return s - m.valor
    return s + m.valor
  }, 0)

  return { saldo: Math.max(0, saldo), movimentos }
}

export async function registrarCreditoCliente(
  accessToken: string,
  input: {
    pessoa_id: string
    pessoa_nome: string
    valor: number
    descricao: string
    devolucao_id?: string
  },
): Promise<void> {
  await requirePermissao('financeiro', accessToken)
  const supabase = await createServiceClient()

  const { error } = await supabase.from('creditos_clientes').insert({
    pessoa_id: input.pessoa_id,
    pessoa_nome: input.pessoa_nome,
    valor: input.valor,
    tipo: 'credito',
    descricao: input.descricao,
    devolucao_id: input.devolucao_id ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function usarCreditoVenda(
  accessToken: string,
  input: {
    pessoa_id: string
    pessoa_nome: string
    valor: number
    venda_id: string
  },
): Promise<void> {
  await requirePermissao('financeiro', accessToken)
  const supabase = await createServiceClient()

  // Valida saldo disponível
  const { saldo } = await buscarSaldoCredito(accessToken, input.pessoa_id)
  if (saldo < input.valor - 0.01) {
    throw new Error(`Saldo insuficiente. Disponível: R$ ${saldo.toFixed(2)}`)
  }

  const { error } = await supabase.from('creditos_clientes').insert({
    pessoa_id: input.pessoa_id,
    pessoa_nome: input.pessoa_nome,
    valor: input.valor,
    tipo: 'uso',
    descricao: `Usado na venda #${input.venda_id.slice(0, 8)}`,
    venda_id: input.venda_id,
  })
  if (error) throw new Error(error.message)
}
