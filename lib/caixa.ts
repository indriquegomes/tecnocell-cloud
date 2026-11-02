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
  lancamentoId?: string | null,
  origem?: string | null,
): Promise<void> {
  if (!lojaId || !(valor > 0)) return
  const { data: caixa, error: erroCaixa } = await supabase
    .from('caixas')
    .select('id')
    .eq('status', 'aberto')
    .eq('loja_id', lojaId)
    .order('aberto_em', { ascending: false }).limit(1).maybeSingle()
  // Uma falha aqui não pode virar silenciosamente "sem caixa aberto" — é
  // exatamente o buraco que este arquivo existe pra fechar (ver comentário
  // acima). Não trava o recebimento (o dinheiro já entrou de verdade), mas
  // precisa ficar visível no log pra alguém conferir a gaveta na mão.
  if (erroCaixa) { console.error('registrarNoCaixa: falha ao buscar caixa aberto:', erroCaixa.message); return }
  if (!caixa) return
  const { error: erroMovimento } = await supabase.from('movimentos_caixa').insert({
    caixa_id: caixa.id,
    tipo: 'recebimento',
    motivo,
    forma_pagamento: formaTexto || 'Dinheiro',
    valor,
    ...(lancamentoId ? { lancamento_id: lancamentoId } : {}),
    ...(origem ? { origem } : {}),
  })
  if (erroMovimento) console.error('registrarNoCaixa: falha ao registrar movimento:', erroMovimento.message)
}

// PAGAMENTO EM DINHEIRO SAI DA GAVETA.
//
// O outro lado do mesmo buraco: até 26/10/2026, marcar um "pagar" como pago em
// DINHEIRO não mexia no caixa — a despesa existia no Financeiro e a cédula sumia da
// gaveta sem ninguém registrar, então o fechamento acusava SOBRA do valor exato.
//
// Quem decide se saiu da gaveta é o dono, no checkbox "Saiu da gaveta" do botão Pago:
// dinheiro guardado em envelope/cofre não passa pela gaveta e não pode mexer nela.
// Quando marcado, grava `retirada` no caixa aberto DAQUELA loja, com lancamento_id e
// origem 'financeiro' — o mesmo par que o "Desfazer" usa pra apagar depois.
//
// Se não há caixa aberto na loja, não registra (mesmo critério do recebimento): não
// se inventa caixa para uma saída que não passou por ele.
export async function retirarDoCaixa(
  supabase: SB,
  lojaId: string | null | undefined,
  valor: number,
  motivo: string,
  lancamentoId?: string | null,
  origem?: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  if (!lojaId || !(valor > 0)) return { ok: false, erro: 'sem loja ou valor' }
  const { data: caixa, error: erroCaixa } = await supabase
    .from('caixas')
    .select('id')
    .eq('status', 'aberto')
    .eq('loja_id', lojaId)
    .order('aberto_em', { ascending: false }).limit(1).maybeSingle()
  if (erroCaixa) { console.error('retirarDoCaixa: falha ao buscar caixa aberto:', erroCaixa.message); return { ok: false, erro: erroCaixa.message } }
  if (!caixa) return { ok: false, erro: 'sem caixa aberto' }
  // A gaveta não pode ficar negativa: dinheiro de envelope/cofre não passa por ela.
  const disponivel = await dinheiroNaGavetaDe(supabase, caixa.id)
  if (disponivel != null && valor > disponivel + 0.009) {
    return { ok: false, erro: `A gaveta tem R$ ${disponivel.toFixed(2)} e a saída é R$ ${valor.toFixed(2)}. Se o dinheiro saiu do envelope/cofre, desmarque "gaveta".` }
  }
  const { error: erroMovimento } = await supabase.from('movimentos_caixa').insert({
    caixa_id: caixa.id,
    tipo: 'retirada',
    motivo,
    forma_pagamento: 'Dinheiro',
    valor,
    ...(lancamentoId ? { lancamento_id: lancamentoId } : {}),
    ...(origem ? { origem } : {}),
  })
  if (erroMovimento) { console.error('retirarDoCaixa: falha ao registrar movimento:', erroMovimento.message); return { ok: false, erro: erroMovimento.message } }
  return { ok: true }
}

// Quanto tem na gaveta AGORA (abertura + dinheiro que entrou − o que saiu + vendas em
// dinheiro da sessão). Serve para o Financeiro avisar antes de tirar da gaveta um
// dinheiro que não está lá — dinheiro de envelope/cofre não passa pela gaveta.
export async function dinheiroNaGavetaDe(supabase: SB, caixaId: string): Promise<number | null> {
  const { data: caixa, error: e1 } = await supabase
    .from('caixas').select('id, valor_abertura').eq('id', caixaId).maybeSingle()
  if (e1) { console.error('dinheiroNaGavetaDe: caixa:', e1.message); return null }
  if (!caixa) return null
  const [{ data: movs, error: e2 }, { data: formas, error: e3 }] = await Promise.all([
    supabase.from('movimentos_caixa').select('tipo, forma_pagamento, valor').eq('caixa_id', caixaId),
    supabase.from('formas_pagamento').select('id, tipo'),
  ])
  if (e2 || e3) { console.error('dinheiroNaGavetaDe:', e2?.message ?? e3?.message); return null }
  const tipoDinheiro = new Set((formas ?? []).filter((f) => (f.tipo ?? '') === 'dinheiro').map((f) => f.id))
  let saldo = Number(caixa.valor_abertura ?? 0)
  for (const m of movs ?? []) {
    if ((m.forma_pagamento ?? '').trim().toLowerCase() !== 'dinheiro') continue
    const v = Number(m.valor ?? 0)
    if (m.tipo === 'recebimento' || m.tipo === 'reforco') saldo += v
    else if (m.tipo === 'retirada' || m.tipo === 'devolucao') saldo -= v
  }
  const { data: vendas, error: e4 } = await supabase
    .from('vendas').select('id').eq('caixa_id', caixaId).eq('status', 'concluida')
  if (e4) { console.error('dinheiroNaGavetaDe: vendas:', e4.message); return null }
  const ids = (vendas ?? []).map((v) => v.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { data: pags, error: e5 } = await supabase
      .from('pagamentos_venda').select('valor, forma_pagamento_id, status')
      .in('venda_id', ids.slice(i, i + 200)).eq('status', 'pago')
    if (e5) { console.error('dinheiroNaGavetaDe: pagamentos:', e5.message); return null }
    for (const p of pags ?? []) if (tipoDinheiro.has(p.forma_pagamento_id)) saldo += Number(p.valor ?? 0)
  }
  return Math.round(saldo * 100) / 100
}

// De qual loja é este lançamento? O Financeiro só conhece o id do lançamento, então o
// caminho é lançamento → venda → depósito → loja. Fiado avulso (sem venda) não tem loja
// e por isso não gera movimento — é o mesmo critério de "não sei de qual gaveta saiu".
export async function lojaDoLancamento(supabase: SB, lancamentoId: string): Promise<string | null> {
  const { data: lanc, error: erroLanc } = await supabase
    .from('lancamentos')
    .select('venda_id, loja_id')
    .eq('id', lancamentoId)
    .maybeSingle()
  if (erroLanc) { console.error('lojaDoLancamento: falha ao buscar lançamento:', erroLanc.message); return null }
  // Conta a pagar (fornecedor, aluguel…) já pode ter a loja gravada na própria linha:
  // é o caminho certo pra ela, porque não existe venda por trás.
  const lojaDoLanc = (lanc as { loja_id?: string | null } | null)?.loja_id
  if (lojaDoLanc) return lojaDoLanc
  const vendaId = (lanc as { venda_id?: string | null } | null)?.venda_id
  if (!vendaId) return null

  const { data: venda, error: erroVenda } = await supabase
    .from('vendas')
    .select('deposito_id')
    .eq('id', vendaId)
    .maybeSingle()
  if (erroVenda) { console.error('lojaDoLancamento: falha ao buscar venda:', erroVenda.message); return null }
  const depositoId = (venda as { deposito_id?: string | null } | null)?.deposito_id
  if (!depositoId) return null

  const { data: dep, error: erroDep } = await supabase
    .from('depositos')
    .select('loja_id')
    .eq('id', depositoId)
    .maybeSingle()
  if (erroDep) { console.error('lojaDoLancamento: falha ao buscar depósito:', erroDep.message); return null }
  return (dep as { loja_id?: string | null } | null)?.loja_id ?? null
}
