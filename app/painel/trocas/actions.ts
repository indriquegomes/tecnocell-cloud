'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAtividade } from '@/lib/log-atividade'
import { palavrasBusca, aplicaBusca } from '@/lib/busca-produtos'

// TROCAS COM FORNECEDOR (garantia / RMA)
//
// Regra do dono (03/11/2026):
//   1. a peça que vai trocar SAI do estoque como operação 'troca'
//   2. cai numa aba geral, que aceita excluir lançamento errado
//   3. é o DONO que diz de qual fornecedor é cada peça (a atendente não escolhe
//      no balcão)
//   4. quando volta, o check dá entrada no PETRÓPOLIS ESTOQUE e fecha a linha
//   5. se voltar peça substituta, compara o custo e registra a perda da diferença
//
// O depósito de retorno é sempre o "PETRÓPOLIS ESTOQUE" (o fundo), nunca o
// "PETRÓPOLIS LOJA" — decisão do dono, senão confunde vitrine com estoque.

const DEPOSITO_RETORNO_NOME = 'PETRÓPOLIS ESTOQUE'
const REVALIDAR = ['/painel/trocas', '/painel/estoque', '/painel/estoque/historico']

type SB = Awaited<ReturnType<typeof createServiceClient>>

async function depositoDeRetorno(supabase: SB): Promise<string | null> {
  const { data } = await supabase.from('depositos').select('id, nome').ilike('nome', `%${DEPOSITO_RETORNO_NOME}%`).limit(1).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

/** Move o estoque de verdade, pelo RPC (atômico, com trava da linha). */
async function movimentar(
  supabase: SB,
  produtoId: string,
  depositoId: string,
  operacao: 'troca' | 'entrada',
  quantidade: number,
  observacao: string,
  userId: string | null,
): Promise<string | null> {
  const { error } = await supabase.rpc('movimentar_estoque', {
    p_produto_id: produtoId,
    p_deposito_id: depositoId,
    p_operacao: operacao,
    p_quantidade: quantidade,
    p_series: [],
    p_observacao: observacao,
    p_user: userId,
    p_created_at: new Date().toISOString(),
  })
  return error?.message ?? null
}

/** 3) Dono classifica o fornecedor na aba. */
export async function definirFornecedor(formData: FormData): Promise<void> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  const fornecedorId = String(formData.get('fornecedor_id') ?? '')
  if (!id) return
  let nome: string | null = null
  if (fornecedorId) {
    const { data } = await supabase.from('pessoas').select('nome').eq('id', fornecedorId).maybeSingle()
    nome = (data as { nome?: string } | null)?.nome ?? null
  }
  await supabase.from('trocas').update({
    fornecedor_id: fornecedorId || null,
    fornecedor_nome: nome,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  await logAtividade('troca.fornecedor', { troca_id: id, fornecedor: nome }, usuario, '/painel/trocas')
  for (const r of REVALIDAR) revalidatePath(r)
}

/** Marca que a peça foi enviada ao fornecedor. */
export async function marcarEnviada(formData: FormData): Promise<void> {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await supabase.from('trocas').update({ status: 'enviada', data_envio: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
  for (const r of REVALIDAR) revalidatePath(r)
}

/**
 * 4 e 5) Check de retorno: volta a mesma peça ou uma substituta.
 * Entra no PETRÓPOLIS ESTOQUE e fecha a linha. Se a substituta custar menos,
 * grava a perda da diferença (o dono quer ver o prejuízo da troca).
 */
export async function confirmarRetorno(formData: FormData): Promise<{ ok: boolean; erro?: string }> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, erro: 'troca não identificada' }

  const { data: troca } = await supabase.from('trocas')
    .select('id, produto_id, produto_nome, quantidade, custo, deposito_saida_id, status')
    .eq('id', id).maybeSingle()
  if (!troca) return { ok: false, erro: 'troca não encontrada' }
  if (troca.status === 'retornou' || troca.status === 'cancelada') return { ok: false, erro: 'esta troca já foi fechada' }

  const substitutoId = String(formData.get('produto_substituto_id') ?? '').trim()
  const ehSubstituta = substitutoId !== '' && substitutoId !== troca.produto_id
  const quantidade = Number(troca.quantidade ?? 1)
  const custoOriginal = Number(troca.custo ?? 0)

  let produtoRetornoId = troca.produto_id
  let produtoRetornoNome = troca.produto_nome
  let custoRetorno = custoOriginal

  if (ehSubstituta) {
    const { data: prod } = await supabase.from('produtos').select('id, nome, preco_custo').eq('id', substitutoId).maybeSingle()
    if (!prod) return { ok: false, erro: 'produto substituto não encontrado' }
    produtoRetornoId = prod.id
    produtoRetornoNome = prod.nome
    custoRetorno = Number(prod.preco_custo ?? 0)
  }

  const deposito = await depositoDeRetorno(supabase)
  if (!deposito) return { ok: false, erro: `depósito "${DEPOSITO_RETORNO_NOME}" não encontrado` }

  const obs = `Troca de fornecedor — retorno${ehSubstituta ? ' (peça substituta)' : ''}${troca.produto_nome ? ` — saiu: ${troca.produto_nome}` : ''}`
  const erroMov = await movimentar(supabase, produtoRetornoId, deposito, 'entrada', quantidade, obs, usuario?.id ?? null)
  if (erroMov) return { ok: false, erro: erroMov }

  // perda quando a peça que voltou vale menos que a que saiu
  const perda = ehSubstituta ? Math.max(0, Math.round((custoOriginal - custoRetorno) * quantidade * 100) / 100) : 0

  const { error } = await supabase.from('trocas').update({
    status: 'retornou',
    data_retorno: new Date().toISOString(),
    produto_retorno_id: produtoRetornoId,
    produto_retorno_nome: produtoRetornoNome,
    custo_retorno: custoRetorno,
    perda: perda > 0 ? perda : null,
    observacao: perda > 0 ? `Perda de R$ ${perda.toFixed(2).replace('.', ',')} — substituta mais barata` : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { ok: false, erro: error.message }

  await logAtividade('troca.retorno', {
    troca_id: id, produto: produtoRetornoNome, custo_original: custoOriginal, custo_retorno: custoRetorno, perda,
  }, usuario, '/painel/trocas')
  for (const r of REVALIDAR) revalidatePath(r)
  return { ok: true }
}

/** Fornecedor recusou / peça perdida: fecha como perda do mês. */
export async function marcarPerdida(formData: FormData): Promise<void> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const motivo = String(formData.get('motivo') ?? '').trim() || 'fornecedor recusou a troca'
  await supabase.from('trocas').update({
    status: 'perdida', data_retorno: new Date().toISOString(), observacao: motivo, updated_at: new Date().toISOString(),
  }).eq('id', id)
  await logAtividade('troca.perdida', { troca_id: id, motivo }, usuario, '/painel/trocas')
  for (const r of REVALIDAR) revalidatePath(r)
}

/**
 * 6) Excluir lançamento feito errado. Devolve a peça ao estoque de onde saiu,
 * pra não sumir mercadoria por causa de um clique errado.
 */
export async function excluirTroca(formData: FormData): Promise<{ ok: boolean; erro?: string }> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, erro: 'troca não identificada' }

  const { data: troca } = await supabase.from('trocas')
    .select('id, produto_id, produto_nome, quantidade, deposito_saida_id, status')
    .eq('id', id).maybeSingle()
  if (!troca) return { ok: false, erro: 'troca não encontrada' }
  if (troca.status === 'retornou') return { ok: false, erro: 'esta troca já retornou ao estoque — excluir deixaria a peça contada duas vezes' }

  // devolve a peça ao depósito de origem (só se a saída tinha depósito)
  if (troca.deposito_saida_id) {
    const erroMov = await movimentar(
      supabase, troca.produto_id, troca.deposito_saida_id, 'entrada', Number(troca.quantidade ?? 1),
      'Estorno de troca (lançamento excluído)', usuario?.id ?? null,
    )
    if (erroMov) return { ok: false, erro: erroMov }
  }

  const { error } = await supabase.from('trocas').delete().eq('id', id)
  if (error) return { ok: false, erro: error.message }
  await logAtividade('troca.excluir', { troca_id: id, produto: troca.produto_nome }, usuario, '/painel/trocas')
  for (const r of REVALIDAR) revalidatePath(r)
  return { ok: true }
}

/**
 * 7) TROCA ABATIDA EM NOTA — o fornecedor não devolve a peça, dá crédito.
 *
 * Regra do dono (04/11/2026): isso NÃO é perda. A peça virou crédito e o crédito
 * compra outras peças. Só existe perda quando o crédito é MENOR que o custo.
 *
 * O que a ação faz, na ordem:
 *   1. abate o valor nas contas a pagar PENDENTES do fornecedor, da mais antiga
 *      pra mais nova (a nota de onde veio a peça pode já estar paga — o dono
 *      pediu explicitamente que valha em qualquer nota do mesmo fornecedor)
 *   2. se não houver dívida pendente suficiente, o que sobra vira CRÉDITO com o
 *      fornecedor: linha a pagar pendente de valor NEGATIVO, que a próxima nota
 *      consome (a soma das pendentes já fica líquida)
 *   3. fecha a troca como 'abatida' guardando valor_abatido
 *   4. só se o crédito for menor que o custo, grava a DIFERENÇA como despesa
 *      categoria 'Perda' (aí sim é prejuízo de verdade)
 *
 * Nada disso mexe em estoque (a peça já saiu como 'troca') nem em saldo de conta
 * (abatimento não é dinheiro saindo).
 */
export async function abaterTrocaNoFornecedor(formData: FormData): Promise<{ ok: boolean; erro?: string; abatido?: number; credito?: number; perda?: number }> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  const valor = Math.round(Number(String(formData.get('valor') ?? '').replace(/\./g, '').replace(',', '.')) * 100) / 100
  const fornecedorId = String(formData.get('fornecedor_id') ?? '').trim()
  if (!id) return { ok: false, erro: 'troca não identificada' }
  if (!(valor > 0)) return { ok: false, erro: 'Informe o valor que o fornecedor abateu.' }
  if (!fornecedorId) return { ok: false, erro: 'Escolha o fornecedor que deu o abatimento.' }

  const { data: troca } = await supabase.from('trocas')
    .select('id, produto_nome, quantidade, custo, status, loja_id, deposito_saida_id')
    .eq('id', id).maybeSingle()
  if (!troca) return { ok: false, erro: 'troca não encontrada' }
  if (troca.status === 'abatida' || troca.status === 'retornou') return { ok: false, erro: 'esta troca já foi fechada' }
  if (troca.status === 'cancelada') return { ok: false, erro: 'esta troca está cancelada' }

  const { data: forn } = await supabase.from('pessoas').select('nome').eq('id', fornecedorId).maybeSingle()
  const fornecedorNome = (forn as { nome?: string } | null)?.nome ?? null
  if (!fornecedorNome) return { ok: false, erro: 'fornecedor não encontrado no cadastro' }

  // contas a pagar pendentes desse fornecedor (o formulário grava o nome, não o id)
  const { data: pendentes, error: erroPend } = await supabase.from('lancamentos')
    .select('id, valor, valor_pago, descricao, data_vencimento')
    .eq('tipo', 'pagar').eq('status', 'pendente').eq('pessoa_nome', fornecedorNome)
    .order('data_vencimento', { ascending: true })
  if (erroPend) return { ok: false, erro: erroPend.message }

  let falta = valor
  let abatidoEmNotas = 0
  for (const p of pendentes ?? []) {
    if (falta <= 0.005) break
    const valorNota = Number(p.valor ?? 0)
    const restante = Math.round((valorNota - Number(p.valor_pago ?? 0)) * 100) / 100
    if (restante <= 0.005) continue
    const abater = Math.min(restante, falta)
    const novoValor = Math.round((valorNota - abater) * 100) / 100
    const { error } = await supabase.from('lancamentos').update({
      valor: novoValor,
      // zerou a nota: sai da lista de pendentes sem inventar pagamento
      status: novoValor <= 0.005 ? 'cancelado' : 'pendente',
      descricao: `${p.descricao ?? 'Mercadoria'} (abateu ${abater.toFixed(2).replace('.', ',')} de troca)`,
      updated_at: new Date().toISOString(),
    }).eq('id', p.id)
    if (error) return { ok: false, erro: `Não deu pra abater na nota ${p.descricao ?? ''}: ${error.message}` }
    falta = Math.round((falta - abater) * 100) / 100
    abatidoEmNotas = Math.round((abatidoEmNotas + abater) * 100) / 100
  }

  // Sobrou abatimento sem dívida pra consumir: vira crédito com o fornecedor.
  let credito = 0
  if (falta > 0.005) {
    credito = falta
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const { error } = await supabase.from('lancamentos').insert({
      descricao: `Crédito de troca — ${troca.produto_nome ?? 'peça'} (fornecedor abateu, sem nota pendente)`,
      valor: -credito,
      tipo: 'pagar',
      status: 'pendente',
      categoria: 'Mercadoria',
      pessoa_nome: fornecedorNome,
      loja_id: troca.loja_id ?? null,
      conta_id: null,
      data_competencia: hoje,
      data_vencimento: hoje,
      updated_at: new Date().toISOString(),
    })
    if (error) return { ok: false, erro: `Abatimento aplicado, mas o crédito de ${credito.toFixed(2)} não gravou: ${error.message}` }
  }

  // Perda SÓ quando o crédito é menor que o custo da peça que saiu.
  const custoTotal = Math.round(Number(troca.custo ?? 0) * Number(troca.quantidade ?? 1) * 100) / 100
  const perda = Math.max(0, Math.round((custoTotal - valor) * 100) / 100)

  const { error: erroTroca } = await supabase.from('trocas').update({
    status: 'abatida',
    valor_abatido: valor,
    abatido_em: new Date().toISOString(),
    fornecedor_id: fornecedorId,
    fornecedor_nome: fornecedorNome,
    perda: perda > 0 ? perda : null,
    observacao: perda > 0
      ? `Abatido R$ ${valor.toFixed(2).replace('.', ',')} na dívida — perda de R$ ${perda.toFixed(2).replace('.', ',')} (crédito menor que o custo)`
      : `Abatido R$ ${valor.toFixed(2).replace('.', ',')} na dívida — sem perda (crédito cobre o custo)`,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (erroTroca) return { ok: false, erro: erroTroca.message }

  // A DIFERENÇA a menor é despesa de verdade (categoria Perda já é despesa no fechamento).
  if (perda > 0.005) {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const { error } = await supabase.from('lancamentos').insert({
      descricao: `Troca sem retorno — diferença a menor (${troca.produto_nome ?? 'peça'} · ${fornecedorNome})`,
      valor: perda,
      tipo: 'pagar',
      status: 'pago',
      categoria: 'Perda',
      pessoa_nome: fornecedorNome,
      loja_id: troca.loja_id ?? null,
      conta_id: null,           // não sai dinheiro: é reconhecimento de perda
      forma_pagamento: 'Troca',
      valor_pago: perda,
      data_pagamento: new Date().toISOString(),
      data_competencia: hoje,
      data_vencimento: hoje,
      updated_at: new Date().toISOString(),
    })
    if (error) return { ok: false, erro: `Troca fechada, mas a perda de ${perda.toFixed(2)} não gravou: ${error.message}` }
  }

  await logAtividade('troca.abatida', {
    troca_id: id,
    produto: troca.produto_nome,
    fornecedor: fornecedorNome,
    abatido: valor,
    abatido_em_notas: abatidoEmNotas,
    credito_gerado: credito,
    custo_peca: custoTotal,
    perda,
  }, usuario, '/painel/trocas')

  for (const r of [...REVALIDAR, '/painel/financeiro', '/painel/contas']) revalidatePath(r)
  return { ok: true, abatido: valor, credito, perda }
}

/**
 * Busca de peça para o lançamento manual. O formulário antigo pedia "código ou
 * ID do produto" e chamava /api/produtos/busca — endpoint que NÃO existe (404),
 * então digitar o nome da peça não achava nada e a troca não era gravada.
 * Agora a busca é por palavra (nome, código ou marca), igual ao Estoque.
 */
export async function buscarProdutosParaTroca(termo: string): Promise<{ id: string; nome: string }[]> {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const palavras = palavrasBusca(termo ?? '')
  if (!palavras.length) return []
  const base = supabase.from('produtos').select('id, nome').eq('ativo', true)
  const { data, error } = await aplicaBusca(base, 'busca_norm', palavras).order('nome').limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; nome: string }[]
}

/**
 * Lançar uma troca na mão (peça que já saiu sem registro, ou troca antiga).
 * Cria a linha e, opcionalmente, já tira do estoque.
 */
export async function lancarTrocaManual(formData: FormData): Promise<{ ok: boolean; erro?: string }> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()

  const produtoId = String(formData.get('produto_id') ?? '').trim()
  const quantidade = Number(formData.get('quantidade') ?? 1) || 1
  const depositoSaida = String(formData.get('deposito_saida_id') ?? '').trim()
  const motivo = String(formData.get('motivo') ?? '').trim() || null
  const tirarDoEstoque = String(formData.get('tirar_do_estoque') ?? '') === '1'
  if (!produtoId) return { ok: false, erro: 'escolha a peça' }

  const { data: prod } = await supabase.from('produtos').select('id, nome, preco_custo').eq('id', produtoId).maybeSingle()
  if (!prod) return { ok: false, erro: 'produto não encontrado' }

  if (tirarDoEstoque) {
    if (!depositoSaida) return { ok: false, erro: 'escolha de qual depósito a peça saiu' }
    const erroMov = await movimentar(supabase, produtoId, depositoSaida, 'troca', quantidade, motivo ?? 'Troca com fornecedor', usuario?.id ?? null)
    if (erroMov) return { ok: false, erro: erroMov }
  }

  const { data: dep } = depositoSaida
    ? await supabase.from('depositos').select('loja_id').eq('id', depositoSaida).maybeSingle()
    : { data: null }

  const { error } = await supabase.from('trocas').insert({
    produto_id: produtoId,
    produto_nome: prod.nome,
    quantidade,
    custo: Number(prod.preco_custo ?? 0),
    loja_id: (dep as { loja_id?: string } | null)?.loja_id ?? null,
    deposito_saida_id: depositoSaida || null,
    motivo,
    status: 'aberta',
    criado_por: usuario?.id ?? null,
  })
  if (error) return { ok: false, erro: error.message }
  for (const r of REVALIDAR) revalidatePath(r)
  return { ok: true }
}
