import type { createServiceClient } from '@/lib/supabase/server'
import { contaDaForma } from '@/lib/conta-da-forma'
import { logAtividade } from '@/lib/log-atividade'
import { travarSeMesFechado } from '@/lib/fechamento'
import { diaDoCampo } from '@/lib/pix-saida'

type SB = Awaited<ReturnType<typeof createServiceClient>>

// DAR BAIXA NUMA CONTA QUE ESTAVA EM ABERTO, quando o PIX do comprovante já provou
// que o dinheiro saiu.
//
// Devolução em PIX nasce 'pago' (a RPC `registrar_devolucao` grava status e data),
// então este caminho é para o resto: estorno de crédito e linha lançada em aberto.
// É o ÚNICO lugar do robô que escreve fora de `pix_saidas`.
//
// O que NÃO é feito aqui, de propósito:
// - não roda contra o caixa do dia (PIX não passa pela gaveta);
// - não mexe em valor, valor_pago além de completar, nem em descrição;
// - mês fechado trava (mesma régua do botão "Pago" da tela);
// - só toca linha 'pendente' — dois cliques não pagam duas vezes.
//
// A conta vem de `contaDaForma` (a mesma tradução do resto do app): PIX → banco da
// loja, e a conta é a única PagBank (docs/mapa/contas-e-pix.md).
export type ResultadoBaixa = { ok: boolean; jaEstavaPago?: boolean; erro?: string; contaId?: string | null }

export async function baixarContaPendente(
  supabase: SB,
  lancamentoId: string,
  diaDoPix: string | null,
  quem: string | null,
): Promise<ResultadoBaixa> {
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, valor, valor_pago, status, forma_pagamento, conta_id, loja_id, data_vencimento, tipo, descricao, pessoa_nome')
    .eq('id', lancamentoId)
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  const conta = data as {
    id: string; valor: number; valor_pago: number | null; status: string | null
    forma_pagamento: string | null; conta_id: string | null; loja_id: string | null
    data_vencimento: string | null; tipo: string; descricao: string | null; pessoa_nome: string | null
  } | null
  if (!conta) return { ok: false, erro: 'lançamento não encontrado' }
  if (conta.status === 'pago') return { ok: false, jaEstavaPago: true }
  if (conta.status !== 'pendente') return { ok: false, erro: `lançamento está "${conta.status}"` }

  const dia = diaDoCampo(diaDoPix) ?? diaDoCampo(conta.data_vencimento)
  const travado = await travarSeMesFechado(supabase, dia, 'marcar esta devolução como paga')
  if (travado) return { ok: false, erro: travado }

  // Meio-dia de São Paulo: o comprovante prova o DIA, não a hora. Usar meio-dia
  // evita o desastre de fim de noite — instante depois das 21h cai no dia seguinte.
  const dataPagamento = dia ? `${dia}T12:00:00-03:00` : new Date().toISOString()
  const contaId = conta.conta_id ?? (await contaDaForma(supabase, 'pix', conta.loja_id))

  const { data: atualizada, error: erroUpd } = await supabase.from('lancamentos').update({
    status: 'pago',
    data_pagamento: dataPagamento,
    valor_pago: Number(conta.valor ?? 0),
    forma_pagamento: 'pix',
    ...(contaId ? { conta_id: contaId } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', lancamentoId).eq('status', 'pendente').select('id')
  if (erroUpd) return { ok: false, erro: erroUpd.message }
  if (!atualizada?.length) return { ok: false, jaEstavaPago: true }

  await logAtividade('pagamento.marcar_pago', {
    lancamento_id: lancamentoId,
    valor: conta.valor,
    cliente: conta.pessoa_nome,
    conta: contaId,
    forma: 'pix',
    origem: 'robo-pix-saida',
    por: quem,
  }, null, '/api/pix-saida/webhook')

  return { ok: true, contaId }
}
