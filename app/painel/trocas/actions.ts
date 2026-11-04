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

const REVALIDAR = ['/painel/trocas', '/painel/estoque', '/painel/estoque/historico', '/painel/financeiro']

type SB = Awaited<ReturnType<typeof createServiceClient>>

/**
 * Depósito de retorno da LOJA da peça: "PETRÓPOLIS ESTOQUE" ou "TERESÓPOLIS ESTOQUE".
 *
 * Antes voltava sempre pro PETRÓPOLIS ESTOQUE — peça de Teresópolis entrava no
 * estoque da outra loja (40 peças hoje). Regra do dono (04/11): peça volta pro
 * estoque da loja de onde saiu.
 */
async function depositoDeRetorno(supabase: SB, lojaId: string | null): Promise<string | null> {
  const { data: deps } = await supabase
    .from('depositos').select('id, nome, loja_id').ilike('nome', '%ESTOQUE%')
  const lista = (deps ?? []) as { id: string; nome: string; loja_id: string | null }[]
  if (lojaId) {
    const daLoja = lista.find((d) => d.loja_id === lojaId)
    if (daLoja) return daLoja.id
  }
  // sem loja na troca: usa o depósito de estoque de Petrópolis como antes
  return lista.find((d) => /PETRÓPOLIS/i.test(d.nome))?.id ?? lista[0]?.id ?? null
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
 * MOTIVO 2 do dono (04/11): o fornecedor trocou a peça. Volta a mesma ou uma
 * substituta e entra no estoque DA LOJA DE ONDE SAIU (não mais sempre Petrópolis).
 * Se a substituta custar menos, a diferença vira perda.
 */
export async function confirmarRetorno(formData: FormData): Promise<{ ok: boolean; erro?: string }> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, erro: 'troca não identificada' }

  const { data: troca } = await supabase.from('trocas')
    .select('id, produto_id, produto_nome, quantidade, custo, deposito_saida_id, status, loja_id')
    .eq('id', id).maybeSingle()
  if (!troca) return { ok: false, erro: 'troca não encontrada' }
  if (troca.status === 'retornou' || troca.status === 'cancelada' || troca.status === 'abatida') return { ok: false, erro: 'esta troca já foi fechada' }

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

  const deposito = await depositoDeRetorno(supabase, troca.loja_id ?? null)
  if (!deposito) return { ok: false, erro: 'depósito de ESTOQUE da loja não encontrado' }

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
/**
 * MOTIVO 1 do dono (04/11): o fornecedor não troca. A peça volta pra loja de
 * origem e vai pra PERDA DO MÊS — não é vendável, então não entra no estoque:
 * o custo vira despesa (categoria 'Perda') na loja de onde saiu.
 */
export async function marcarPerdida(formData: FormData): Promise<{ ok: boolean; erro?: string }> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, erro: 'troca não identificada' }
  const motivo = String(formData.get('motivo') ?? '').trim() || 'fornecedor não trocou a peça'

  const { data: troca } = await supabase.from('trocas')
    .select('id, produto_nome, quantidade, custo, status, loja_id, fornecedor_nome')
    .eq('id', id).maybeSingle()
  if (!troca) return { ok: false, erro: 'troca não encontrada' }
  if (troca.status === 'perdida' || troca.status === 'retornou' || troca.status === 'abatida') {
    return { ok: false, erro: 'esta troca já foi fechada' }
  }

  const custoPerdido = Math.round(Number(troca.custo ?? 0) * Number(troca.quantidade ?? 1) * 100) / 100

  const { error } = await supabase.from('trocas').update({
    status: 'perdida',
    data_retorno: new Date().toISOString(),
    perda: custoPerdido > 0 ? custoPerdido : null,
    observacao: motivo,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { ok: false, erro: error.message }

  // PERDA DO MÊS: sem lançamento, o custo da peça sumia do resultado (a peça saiu
  // do estoque e nunca virou CMV). Categoria 'Perda' já é despesa no fechamento.
  if (custoPerdido > 0.005) {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const { error: erroPerda } = await supabase.from('lancamentos').insert({
      descricao: `Perda de troca — ${troca.produto_nome ?? 'peça'} (${troca.fornecedor_nome ?? 'fornecedor não trocou'})`,
      valor: custoPerdido,
      tipo: 'pagar',
      status: 'pago',
      categoria: 'Perda',
      pessoa_nome: troca.fornecedor_nome ?? null,
      loja_id: troca.loja_id ?? null,
      conta_id: null,        // não sai dinheiro: é reconhecimento de perda
      forma_pagamento: 'Troca',
      valor_pago: custoPerdido,
      data_pagamento: new Date().toISOString(),
      data_competencia: hoje,
      data_vencimento: hoje,
      updated_at: new Date().toISOString(),
    })
    if (erroPerda) return { ok: false, erro: `Troca fechada, mas a perda de ${custoPerdido.toFixed(2)} não gravou: ${erroPerda.message}` }
  }

  await logAtividade('troca.perdida', { troca_id: id, motivo, perda: custoPerdido }, usuario, '/painel/trocas')
  for (const r of REVALIDAR) revalidatePath(r)
  return { ok: true }
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
  // Perda e abatimento já gravaram lançamento no financeiro: excluir a linha
  // deixaria a despesa (ou o crédito) sem origem. Estorna no Financeiro primeiro.
  if (troca.status === 'perdida' || troca.status === 'abatida') {
    return { ok: false, erro: 'esta troca já foi fechada e gerou lançamento no financeiro. Estorne por lá primeiro (Contas a Pagar).' }
  }

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
/**
 * Abate `valor` na dívida pendente do fornecedor DA LOJA informada, da nota mais
 * antiga para a mais nova. O que sobrar sem dívida vira crédito (linha negativa).
 * Usado pelo abatimento de uma peça e pelo abatimento em grupo.
 */
async function abaterNaDivida(
  supabase: SB,
  fornecedorNome: string,
  lojaId: string | null,
  valor: number,
  descricaoCredito: string,
): Promise<{ ok: boolean; erro?: string; credito: number }> {
  let qPend = supabase.from('lancamentos')
    .select('id, valor, valor_pago, descricao, data_vencimento')
    .eq('tipo', 'pagar').eq('status', 'pendente').eq('pessoa_nome', fornecedorNome)
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
    const { error } = await supabase.from('lancamentos').update({
      valor: novoValor,
      // zerou a nota: sai da lista de pendentes sem inventar pagamento
      status: novoValor <= 0.005 ? 'cancelado' : 'pendente',
      descricao: `${p.descricao ?? 'Mercadoria'} (abateu ${abater.toFixed(2).replace('.', ',')} de troca)`,
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

/**
 * Perda vira despesa de verdade (categoria 'Perda'). Sem isso o custo da peça
 * sumia do resultado: saiu do estoque e nunca virou CMV.
 * conta_id nulo de propósito — não sai dinheiro, é reconhecimento de perda.
 */
async function lancarPerdaDaTroca(
  supabase: SB,
  fornecedorNome: string | null,
  lojaId: string | null,
  valor: number,
  descricao: string,
): Promise<string | null> {
  if (!(valor > 0.005)) return null
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { error } = await supabase.from('lancamentos').insert({
    descricao,
    valor,
    tipo: 'pagar',
    status: 'pago',
    categoria: 'Perda',
    pessoa_nome: fornecedorNome,
    loja_id: lojaId,
    conta_id: null,
    forma_pagamento: 'Troca',
    valor_pago: valor,
    data_pagamento: new Date().toISOString(),
    data_competencia: hoje,
    data_vencimento: hoje,
    updated_at: new Date().toISOString(),
  })
  return error?.message ?? null
}

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

  const abatimento = await abaterNaDivida(
    supabase, fornecedorNome, troca.loja_id ?? null, valor,
    `Crédito de troca — ${troca.produto_nome ?? 'peça'} (abateu ${valor.toFixed(2).replace('.', ',')}, sem nota pendente)`,
  )
  if (!abatimento.ok) return { ok: false, erro: abatimento.erro }
  const credito = abatimento.credito
  const abatidoEmNotas = Math.round((valor - credito) * 100) / 100

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
  const erroPerda = await lancarPerdaDaTroca(
    supabase, fornecedorNome, troca.loja_id ?? null, perda,
    `Troca sem retorno — diferença a menor (${troca.produto_nome ?? 'peça'} · ${fornecedorNome})`,
  )
  if (erroPerda) return { ok: false, erro: `Troca fechada, mas a perda de ${perda.toFixed(2)} não gravou: ${erroPerda}` }

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
 * ABATIMENTO EM GRUPO — o caso real do dono: manda 10 peças e o fornecedor abate
 * um valor único (ex.: 910,00) na dívida. O botão da linha abate uma peça por
 * vez e não serve pra isso.
 *
 * O valor é RATEADO entre as peças escolhidas, proporcional ao custo de cada uma.
 * A dívida do fornecedor cai pelo valor cheio; cada peça guarda a sua fatia em
 * valor_abatido e a perda dela é (custo − fatia), só quando positiva. O total da
 * perda é lançado uma vez como despesa.
 */
export async function abaterTrocasEmLote(formData: FormData): Promise<{ ok: boolean; erro?: string; abatido?: number; credito?: number; perda?: number; pecas?: number }> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const ids = String(formData.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const valor = Math.round(Number(String(formData.get('valor') ?? '').replace(/\./g, '').replace(',', '.')) * 100) / 100
  const fornecedorId = String(formData.get('fornecedor_id') ?? '').trim()
  if (ids.length === 0 && valor <= 0) return { ok: false, erro: 'Informe o valor que o fornecedor abateu.' }
  if (!(valor > 0)) return { ok: false, erro: 'Informe o valor total que o fornecedor abateu.' }
  if (!fornecedorId) return { ok: false, erro: 'Escolha o fornecedor que deu o abatimento.' }

  const { data: forn } = await supabase.from('pessoas').select('nome').eq('id', fornecedorId).maybeSingle()
  const fornecedorNome = (forn as { nome?: string } | null)?.nome ?? null
  if (!fornecedorNome) return { ok: false, erro: 'fornecedor não encontrado no cadastro' }

  const custoDe = (t: { custo: number | null; quantidade: number | null }) =>
    Math.round(Number(t.custo ?? 0) * Number(t.quantidade ?? 1) * 100) / 100

  let pecas: { id: string; produto_nome: string | null; quantidade: number | null; custo: number | null; status: string; loja_id: string | null }[]

  if (ids.length) {
    // seleção manual (opcional): vale só pra peça em aberto
    const { data: linhas } = await supabase.from('trocas')
      .select('id, produto_nome, quantidade, custo, status, loja_id')
      .in('id', ids)
    pecas = (linhas ?? []).filter((t) => t.status === 'aberta' || t.status === 'enviada')
    if (!pecas.length) return { ok: false, erro: 'Nenhuma das peças marcadas está em aberto.' }
  } else {
    // AUTOMÁTICO (regra do dono): quem manda é o valor. O app fecha as peças
    // MAIS ANTIGAS desse fornecedor até o custo delas caber no valor abatido.
    // Nada de escolher quantidade na mão.
    const { data: abertas, error } = await supabase.from('trocas')
      .select('id, produto_nome, quantidade, custo, status, loja_id, data_saida')
      .eq('fornecedor_id', fornecedorId)
      .in('status', ['aberta', 'enviada'])
      .order('data_saida', { ascending: true })
    if (error) return { ok: false, erro: error.message }
    const lista = abertas ?? []
    if (!lista.length) return { ok: false, erro: `Nenhuma peça em aberto desse fornecedor. Classifique o fornecedor nas peças primeiro.` }
    const escolhidas: typeof lista = []
    let acc = 0
    for (const t of lista) {
      const c = custoDe(t)
      if (c <= 0) continue
      if (Math.round((acc + c) * 100) / 100 > valor + 0.005) continue   // não cabe no valor
      escolhidas.push(t)
      acc = Math.round((acc + c) * 100) / 100
    }
    if (!escolhidas.length) {
      return { ok: false, erro: `Nenhuma peça em aberto desse fornecedor cabe em ${valor.toFixed(2)}. O custo da peça mais barata é maior que o valor abatido — selecione as peças na mão.` }
    }
    pecas = escolhidas
  }

  const custoTotal = Math.round(pecas.reduce((s, t) => s + custoDe(t), 0) * 100) / 100
  if (custoTotal <= 0) return { ok: false, erro: 'As peças selecionadas estão sem custo — confira o cadastro do produto.' }

  // rateio proporcional ao custo; a última peça absorve a sobra de centavo
  const fatias: { id: string; lojaId: string | null; nome: string | null; custo: number; fatia: number }[] = []
  let acumulado = 0
  pecas.forEach((t, i) => {
    const custo = custoDe(t)
    const ultima = i === pecas.length - 1
    const fatia = ultima
      ? Math.round((valor - acumulado) * 100) / 100
      : Math.round((valor * (custo / custoTotal)) * 100) / 100
    acumulado = Math.round((acumulado + fatia) * 100) / 100
    fatias.push({ id: t.id, lojaId: (t.loja_id as string | null) ?? null, nome: (t.produto_nome as string | null) ?? null, custo, fatia })
  })

  // abate a dívida por loja (cada loja tem a sua conta a pagar com o fornecedor)
  const porLoja = new Map<string, number>()
  for (const f of fatias) {
    const chave = f.lojaId ?? ''
    porLoja.set(chave, Math.round(((porLoja.get(chave) ?? 0) + f.fatia) * 100) / 100)
  }
  let credito = 0
  let abatidoTotal = 0
  for (const [lojaId, valorLoja] of porLoja) {
    if (valorLoja <= 0.005) continue
    const r = await abaterNaDivida(
      supabase, fornecedorNome, lojaId || null, valorLoja,
      `Crédito de troca — remessa (${pecas.length} peças, abateu ${valorLoja.toFixed(2).replace('.', ',')}, sem nota pendente)`,
    )
    if (!r.ok) return { ok: false, erro: r.erro }
    credito = Math.round((credito + r.credito) * 100) / 100
    abatidoTotal = Math.round((abatidoTotal + valorLoja - r.credito) * 100) / 100
  }

  const perdaTotal = Math.max(0, Math.round((custoTotal - valor) * 100) / 100)

  for (const f of fatias) {
    const perdaPeca = Math.max(0, Math.round((f.custo - f.fatia) * 100) / 100)
    const { error } = await supabase.from('trocas').update({
      status: 'abatida',
      valor_abatido: f.fatia,
      abatido_em: new Date().toISOString(),
      fornecedor_id: fornecedorId,
      fornecedor_nome: fornecedorNome,
      perda: perdaPeca > 0 ? perdaPeca : null,
      observacao: `Abatido em grupo: ${f.fatia.toFixed(2).replace('.', ',')} de ${valor.toFixed(2).replace('.', ',')} (${pecas.length} peças)`,
      updated_at: new Date().toISOString(),
    }).eq('id', f.id)
    if (error) return { ok: false, erro: error.message }
  }

  const lojaPerda = fatias[0]?.lojaId ?? null
  const erroPerda = await lancarPerdaDaTroca(
    supabase, fornecedorNome, lojaPerda, perdaTotal,
    `Troca sem retorno — diferença a menor em remessa de ${pecas.length} peças (${fornecedorNome})`,
  )
  if (erroPerda) return { ok: false, erro: `Abatimento aplicado, mas a perda de ${perdaTotal.toFixed(2)} não gravou: ${erroPerda}` }

  await logAtividade('troca.abatida_lote', {
    trocas: pecas.map((p) => p.id), fornecedor: fornecedorNome, abatido: valor,
    abatido_em_notas: abatidoTotal, credito_gerado: credito, custo_total: custoTotal, perda: perdaTotal,
  }, usuario, '/painel/trocas')

  for (const r of [...REVALIDAR, '/painel/financeiro', '/painel/contas']) revalidatePath(r)
  return { ok: true, abatido: valor, credito, perda: perdaTotal, pecas: pecas.length }
}

/**
 * AJUSTAR CUSTO da peça — pedido do dono (04/11).
 *
 * O fornecedor cobra/credita pelo custo da ÚLTIMA conta, mas o app guarda o custo
 * diluído (média de todas as entradas). Isso gera diferenças de centavos a poucos
 * reais que atrapalham o abatimento.
 *
 * Dois escopos (escolha do dono):
 *   - só a troca (padrão): corrige a linha, NÃO mexe no cadastro do produto, então
 *     não reavalia estoque nem CMV
 *   - cadastro também: alinha o preco_custo do produto (muda estoque e CMV futuro)
 */
export async function ajustarCustoTroca(formData: FormData): Promise<{ ok: boolean; erro?: string; de?: number; para?: number; cadastro?: boolean }> {
  const usuario = await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const id = String(formData.get('id') ?? '')
  const novo = Math.round(Number(String(formData.get('custo') ?? '').replace(/\./g, '').replace(',', '.')) * 100) / 100
  const noCadastro = String(formData.get('no_cadastro') ?? '') === '1'
  if (!id) return { ok: false, erro: 'troca não identificada' }
  if (!(novo >= 0)) return { ok: false, erro: 'Informe o custo novo.' }

  const { data: troca } = await supabase.from('trocas')
    .select('id, produto_id, produto_nome, custo, quantidade, status')
    .eq('id', id).maybeSingle()
  if (!troca) return { ok: false, erro: 'troca não encontrada' }
  const de = Number(troca.custo ?? 0)
  if (Math.abs(de - novo) < 0.001 && !noCadastro) return { ok: true, de, para: novo }

  const { error: e1 } = await supabase.from('trocas')
    .update({ custo: novo, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (e1) return { ok: false, erro: e1.message }

  if (noCadastro && troca.produto_id) {
    const { error: e2 } = await supabase.from('produtos')
      .update({ preco_custo: novo, updated_at: new Date().toISOString() })
      .eq('id', troca.produto_id)
    if (e2) return { ok: false, erro: `Troca ajustada, mas o cadastro do produto não: ${e2.message}` }
  }

  await logAtividade('produto.custo_ajustado', {
    produto_id: troca.produto_id, produto: troca.produto_nome, troca_id: id, de, para: novo,
    origem: 'aba Trocas', escopo: noCadastro ? 'troca + cadastro' : 'somente a troca',
  }, usuario, '/painel/trocas')
  for (const r of [...REVALIDAR, ...(noCadastro ? ['/painel/produtos', '/painel/estoque'] : [])]) revalidatePath(r)
  return { ok: true, de, para: novo, cadastro: noCadastro }
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
