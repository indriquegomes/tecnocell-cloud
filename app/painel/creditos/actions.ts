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
  lojaId: string,
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

  // TODAS as linhas do cliente (paginadas) — o saldo TEM que somar o extrato inteiro.
  // Antes usava .limit(50) e o saldo saía errado pra quem tem mais de 50 movimentos.
  //
  // A loja de cada linha é resolvida AQUI, não no filtro: o estorno cancela um crédito
  // e vale pela loja DESSE crédito. Quando alguém grava estorno fora da tela (sem
  // `loja_id`, como aconteceu em 22–23/11), o filtro `.eq('loja_id', lojaId)` deixava o
  // estorno de fora e o crédito inteiro dentro: RODRIGO PEREIRA aparecia no PDV com
  // R$ 1.025,50 de vale quando o saldo real era R$ 25,50 — o cliente podia gastar
  // crédito que não existia. Seguindo o vínculo (`estorna_credito_id`), o estorno cai na
  // loja certa mesmo se a linha veio incompleta.
  const todos = await fetchAll<MovimentoCredito & { loja_id: string | null; estorna_credito_id: string | null }>(
    (from, to) => supabase
      .from('creditos_clientes')
      .select('id, tipo, valor, descricao, created_at, loja_id, estorna_credito_id')
      .eq('pessoa_id', pessoaId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  )
  const lojaDoCredito = new Map(
    todos.filter((m) => m.tipo !== 'estorno').map((m) => [m.id, m.loja_id]),
  )
  const lojaDaLinha = (m: MovimentoCredito & { loja_id: string | null; estorna_credito_id: string | null }) =>
    (m.tipo === 'estorno' && m.estorna_credito_id ? (lojaDoCredito.get(m.estorna_credito_id) ?? m.loja_id) : m.loja_id)
  const daLoja = todos.filter((m) => lojaDaLinha(m) === lojaId)
  // 'credito' entra (+); 'uso' e 'estorno' saem (−). O estorno CANCELA um crédito,
  // então subtrai — antes somava, o que dobrava o saldo ao estornar.
  const saldo = daLoja.reduce((s, m) => {
    if (m.tipo === 'uso' || m.tipo === 'estorno') return s - m.valor
    return s + m.valor
  }, 0)
  const movimentos = daLoja.slice(0, 50)   // extrato recente pra exibir

  return { saldo: Math.max(0, saldo), movimentos }
}

export async function registrarCreditoCliente(
  accessToken: string,
  input: {
    pessoa_id: string
    pessoa_nome: string
    valor: number
    descricao: string
    loja_id: string
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
    loja_id: input.loja_id,
    devolucao_id: input.devolucao_id ?? null,
  })
  if (error) throw new Error(error.message)
}

// (removido) usarCreditoVenda — o débito do crédito na venda passou a ser feito
// DENTRO de finalizar_venda (migration 2026-07-10), atômico e com lock do cliente
// (2026-07-26). Esta versão avulsa lia o saldo sem lock e inseria o 'uso' fora de
// transação — mesma corrida do RPC, mas sem nem a atomicidade. Era código morto.
