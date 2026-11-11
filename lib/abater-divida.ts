import type { createServiceClient } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Abate `valor` na dívida pendente do fornecedor da loja informada, da nota MAIS ANTIGA
 * para a mais nova.
 *
 * Como funciona, e por que assim:
 *  1. **encolhe o `valor` da nota** (`valor - abatido`) e escreve na descrição o quanto
 *     foi abatido — a nota passa a valer o que ainda se deve. Não usa `valor_pago`: o
 *     app usa uma régua só, e é a mesma que a troca de fornecedor já usa;
 *  2. quando a nota chega a zero, marca `cancelado` — sai da lista de pendentes sem
 *     inventar pagamento (nada saiu de conta por causa do abatimento);
 *  3. se o abatimento for MAIOR que a dívida, o que sobra vira **crédito** com o
 *     fornecedor: uma linha a pagar com valor NEGATIVO, que a próxima nota consome
 *     sozinha (a soma das pendentes já fica líquida).
 *
 * Não mexe em estoque nem em saldo de conta: abatimento não é dinheiro entrando ou
 * saindo, é dívida deixando de existir.
 *
 * Usado por: abatimento de troca (peça devolvida ao fornecedor) e baixa de pagamento
 * de mercadoria (pagou, abate na nota).
 */
export async function abaterNaDivida(
  supabase: SB,
  fornecedorNome: string,
  lojaId: string | null,
  valor: number,
  descricaoCredito: string,
  rotulo = 'troca',
  /** quando vem o id do cadastro, filtra por ele (o nome no lançamento pode estar velho) */
  pessoaId: string | null = null,
): Promise<{ ok: boolean; erro?: string; credito: number }> {
  let qPend = supabase.from('lancamentos')
    .select('id, valor, valor_pago, descricao, data_vencimento, historico_pagamentos')
    .eq('tipo', 'pagar').eq('status', 'pendente')
  qPend = pessoaId ? qPend.eq('pessoa_id', pessoaId) : qPend.eq('pessoa_nome', fornecedorNome)
  if (lojaId) qPend = qPend.eq('loja_id', lojaId)
  const { data: pendentes, error: erroPend } = await qPend.order('data_vencimento', { ascending: true })
  if (erroPend) return { ok: false, erro: erroPend.message, credito: 0 }

  let falta = valor
  for (const p of pendentes ?? []) {
    if (falta <= 0.005) break
    const valorNota = Number(p.valor ?? 0)
    if (valorNota <= 0) continue              // linha de crédito já existente
    const restante = Math.round((valorNota - Number(p.valor_pago ?? 0)) * 100) / 100
    if (restante <= 0.005) continue
    const abater = Math.min(restante, falta)
    const novoValor = Math.round((valorNota - abater) * 100) / 100
    // histórico do pagamento fica registrado na própria nota (é o que a tela mostra
    // quando alguém abre o lançamento para saber como aquela dívida foi baixada)
    const historico = Array.isArray(p.historico_pagamentos)
      ? (p.historico_pagamentos as { valor: number; forma: string; data: string }[])
      : []
    const { error } = await supabase.from('lancamentos').update({
      valor: novoValor,
      // zerou a nota: sai da lista de pendentes sem inventar pagamento
      status: novoValor <= 0.005 ? 'cancelado' : 'pendente',
      descricao: `${p.descricao ?? 'Mercadoria'} (abateu ${abater.toFixed(2).replace('.', ',')} de ${rotulo})`,
      historico_pagamentos: [...historico, { valor: abater, forma: rotulo, data: new Date().toISOString() }],
      updated_at: new Date().toISOString(),
    }).eq('id', p.id)
    if (error) return { ok: false, erro: `Não deu pra abater em ${p.descricao ?? 'nota'}: ${error.message}`, credito: 0 }
    falta = Math.round((falta - abater) * 100) / 100
  }

  let credito = 0
  if (falta > 0.005) {
    credito = falta
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const { error } = await supabase.from('lancamentos').insert({
      descricao: descricaoCredito,
      valor: -credito,
      tipo: 'pagar',
      status: 'pendente',
      categoria: 'Mercadoria',
      pessoa_nome: fornecedorNome,
      loja_id: lojaId,
      conta_id: null,
      data_competencia: hoje,
      data_vencimento: hoje,
      updated_at: new Date().toISOString(),
    })
    if (error) return { ok: false, erro: `Abatimento aplicado, mas o crédito de ${credito.toFixed(2)} não gravou: ${error.message}`, credito: 0 }
  }
  return { ok: true, credito }
}
