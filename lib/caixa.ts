import type { createServiceClient } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createServiceClient>>

// FIADO RECEBIDO ENTRA NO CAIXA.
//
// Buraco que existia: a Duda cobrava R$50 de fiado em espécie, o dinheiro ia pra
// gaveta, e o caixa não sabia de nada. No fechamento a contagem dava R$50 a MAIS que o
// esperado e o sistema acusava SOBRA — culpando quem tinha feito tudo certo.
//
// Todo recebimento de crediário vira movimento do caixa aberto DAQUELA LOJA:
//   dinheiro → soma na gaveta (é cédula que entrou de verdade)
//   PIX/cartão → não é gaveta, mas aparece na linha do seu tipo pra conferir
//                (o comprovante do PIX de um fiado também precisa bater)
//
// Se não há caixa aberto na loja, não registra — e não quebra o recebimento: o dinheiro
// entrou de qualquer forma, e travar a cobrança por causa disso seria pior.
//
// Vive aqui (e não dentro do PDV) porque o Financeiro precisa da MESMA regra: era
// justamente por ter cópia só no PDV que a baixa pelo Financeiro não chegava no caixa.
export async function registrarNoCaixa(
  supabase: SB,
  lojaId: string | null | undefined,
  valor: number,
  formaTexto: string,
  motivo: string,
): Promise<void> {
  if (!lojaId || !(valor > 0)) return
  const { data: caixa } = await supabase
    .from('caixas')
    .select('id')
    .eq('status', 'aberto')
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (!caixa) return
  await supabase.from('movimentos_caixa').insert({
    caixa_id: caixa.id,
    tipo: 'recebimento',
    motivo,
    forma_pagamento: formaTexto || 'Dinheiro',
    valor,
  })
}

// De qual loja é este lançamento? O Financeiro só conhece o id do lançamento, então o
// caminho é lançamento → venda → depósito → loja. Fiado avulso (sem venda) não tem loja
// e por isso não gera movimento — é o mesmo critério de "não sei de qual gaveta saiu".
export async function lojaDoLancamento(supabase: SB, lancamentoId: string): Promise<string | null> {
  const { data: lanc } = await supabase
    .from('lancamentos')
    .select('venda_id')
    .eq('id', lancamentoId)
    .maybeSingle()
  const vendaId = (lanc as { venda_id?: string | null } | null)?.venda_id
  if (!vendaId) return null

  const { data: venda } = await supabase
    .from('vendas')
    .select('deposito_id')
    .eq('id', vendaId)
    .maybeSingle()
  const depositoId = (venda as { deposito_id?: string | null } | null)?.deposito_id
  if (!depositoId) return null

  const { data: dep } = await supabase
    .from('depositos')
    .select('loja_id')
    .eq('id', depositoId)
    .maybeSingle()
  return (dep as { loja_id?: string | null } | null)?.loja_id ?? null
}
