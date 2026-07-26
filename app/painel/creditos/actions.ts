'use server'

import { createServiceClient, requireAuth, permissoesEfetivas, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'

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
  // Ler o saldo pra aplicar numa venda faz parte de operar o caixa — quem tem
  // 'pdv' pode ver (a vendedora não tem 'financeiro'). Antes exigia 'financeiro'
  // e o erro era engolido no PDV → o crédito nunca aparecia pra elas.
  const u = await requireAuth(accessToken)
  const { permissoes, isMaster } = await permissoesEfetivas(u.id)
  if (!temPermissao(permissoes, 'pdv', isMaster) && !temPermissao(permissoes, 'financeiro', isMaster)) {
    throw new Error('Sem permissão para ver crédito do cliente.')
  }
  const supabase = await createServiceClient()

  // TODAS as linhas (paginadas) — o saldo TEM que somar o extrato inteiro. Antes
  // usava .limit(50) e o saldo saía errado pra quem tem mais de 50 movimentos.
  const todos = await fetchAll<MovimentoCredito>(
    (from, to) => supabase
      .from('creditos_clientes')
      .select('id, tipo, valor, descricao, created_at')
      .eq('pessoa_id', pessoaId)
      .order('created_at', { ascending: false })
      .range(from, to),
  )
  // 'credito' entra (+); 'uso' e 'estorno' saem (−). O estorno CANCELA um crédito,
  // então subtrai — antes somava, o que dobrava o saldo ao estornar.
  const saldo = todos.reduce((s, m) => {
    if (m.tipo === 'uso' || m.tipo === 'estorno') return s - m.valor
    return s + m.valor
  }, 0)
  const movimentos = todos.slice(0, 50)   // extrato recente pra exibir

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

// (removido) usarCreditoVenda — o débito do crédito na venda passou a ser feito
// DENTRO de finalizar_venda (migration 2026-07-10), atômico e com lock do cliente
// (2026-07-26). Esta versão avulsa lia o saldo sem lock e inseria o 'uso' fora de
// transação — mesma corrida do RPC, mas sem nem a atomicidade. Era código morto.
