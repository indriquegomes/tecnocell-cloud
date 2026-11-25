'use server'

// AÇÕES DA ABA PARTICULAR (painel divertido do dono, protótipo aprovado).
//
// Régua da aba, combinada com o dono (lib/particular.ts): pró-labore do mês é o
// dinheiro reservado; conta particular paga sai dele; o que sobra é o que pode
// ser retirado. Nada aqui é despesa da loja — por isso a baixa NÃO mexe em
// caixa/conta da empresa (pró-labore não passa pela gaveta).
//
// Potinhos são pessoais: gravam em metas_poupanca com escopo = 'pessoal', para
// não se misturarem com as metas do negócio.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { formatBRL, hojeSP } from '@/lib/utils'
import { resumoParticular } from '@/lib/particular'

const VOLTAR = '/painel/particular'

const msg = (texto: string, aba?: string) =>
  redirect(`${VOLTAR}${aba ? `?aba=${aba}` : ''}${aba ? '&' : '?'}msg=${encodeURIComponent(texto)}`)

// Soma o que já entrou/saiu no mês para a régua dos potes (mesma do resumo).
async function sobraDoMes(supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  const hoje = hojeSP()
  const inicio = hoje.slice(0, 7) + '-01'
  const [ano, m] = hoje.slice(0, 7).split('-').map(Number)
  const prox = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  const { data } = await supabase.from('lancamentos')
    .select('categoria, valor, valor_pago, status')
    .eq('tipo', 'pagar')
    .in('categoria', ['Pró-labore', 'Particular'])
    .gte('data_vencimento', inicio).lt('data_vencimento', prox)
  const r = resumoParticular((data ?? []) as { categoria: string | null; valor?: number | null; valor_pago?: number | null; status?: string | null }[])
  return { sobra: r.sobra, inicio, prox }
}

/** Paguei! — baixa a conta particular (pendente → pago), sem tocar em caixa/conta. */
export async function pagarParticular(id: string) {
  await requirePermissao('master')
  const supabase = await createServiceClient()
  const { data: linha } = await supabase.from('lancamentos')
    .select('valor, descricao').eq('id', id).maybeSingle()
  if (!linha) msg('Conta não encontrada.')
  const { error } = await supabase.from('lancamentos').update({
    status: 'pago',
    valor_pago: Number((linha as { valor?: number }).valor ?? 0),
    data_pagamento: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'pendente')
  if (error) msg('Não deu para pagar: ' + error.message)
  revalidatePath(VOLTAR)
  msg(`Pago: ${(linha as { descricao?: string | null }).descricao ?? 'conta'}.`)
}

/** Anotar dinheiro — registra na hora uma saída ou entrada particular. */
export async function anotarParticular(formData: FormData) {
  const usuario = await requirePermissao('master')
  const supabase = await createServiceClient()

  const entrada = formData.get('tipo') === 'entrada'
  const valor = Math.max(0, parseFloat(String(formData.get('valor') ?? '0').replace(',', '.')) || 0)
  const categoria = String(formData.get('categoria') ?? '').trim() || 'Outros'
  if (!(valor > 0)) msg('Informe o valor antes de salvar.', 'anotar')

  const hoje = hojeSP()
  const { error } = await supabase.from('lancamentos').insert({
    id: crypto.randomUUID(),
    descricao: categoria,
    valor,
    tipo: entrada ? 'receber' : 'pagar',
    categoria: 'Particular',
    subcategoria: categoria,
    status: 'pago',
    valor_pago: valor,
    data_pagamento: new Date().toISOString(),
    data_vencimento: hoje,
    criado_por: usuario?.id ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error) msg('Não deu para anotar: ' + error.message, 'anotar')

  revalidatePath(VOLTAR)
  msg(entrada ? 'Entrada anotada.' : 'Saída anotada.')
}

/** Guardar num potinho pessoal (R$ 500), conferindo o que sobrou do mês. */
export async function guardarNoPote(formData: FormData) {
  await requirePermissao('master')
  const supabase = await createServiceClient()

  const poteId = String(formData.get('pote_id') ?? '')
  const valorPedido = Math.max(0, parseFloat(String(formData.get('valor') ?? '500').replace(',', '.')) || 0)
  const { data: pote } = await supabase.from('metas_poupanca')
    .select('id, nome, atual, objetivo, escopo').eq('id', poteId).eq('escopo', 'pessoal').maybeSingle()
  if (!pote) msg('Pote não encontrado.', 'potinhos')

  const atual = Number((pote as { atual?: number }).atual ?? 0)
  const objetivo = Number((pote as { objetivo?: number }).objetivo ?? 0)
  const nome = String((pote as { nome?: string }).nome ?? 'pote')
  const valor = Math.min(valorPedido, Math.max(0, objetivo - atual))
  if (!(valor > 0)) msg(`O pote ${nome} já está cheio.`, 'potinhos')

  const { sobra } = await sobraDoMes(supabase)
  const { data: aportes } = await supabase.from('aportes_poupanca')
    .select('valor, metas_poupanca!inner(escopo)').eq('metas_poupanca.escopo', 'pessoal')
  const guardadoNoMes = (aportes ?? []).reduce((t, a) => t + Number((a as { valor?: number }).valor ?? 0), 0)
  const disponivel = Math.round((sobra - guardadoNoMes) * 100) / 100
  if (disponivel < valor) msg('Saldo insuficiente para guardar.', 'potinhos')

  const { error } = await supabase.from('metas_poupanca').update({
    atual: Math.round((atual + valor) * 100) / 100,
    updated_at: new Date().toISOString(),
  }).eq('id', poteId)
  if (error) msg('Não deu para guardar: ' + error.message, 'potinhos')

  await supabase.from('aportes_poupanca').insert({
    id: crypto.randomUUID(), meta_id: poteId, valor,
  })
  revalidatePath(VOLTAR)
  const chegou = atual + valor >= objetivo
  msg(chegou ? `Pote ${nome} completou!` : `${formatBRL(valor)} guardados no pote ${nome}.`, 'potinhos')
}

/** Cria um potinho pessoal novo (nome + objetivo). */
export async function criarPote(formData: FormData) {
  await requirePermissao('master')
  const supabase = await createServiceClient()
  const nome = String(formData.get('nome') ?? '').trim()
  const objetivo = Math.max(0, parseFloat(String(formData.get('objetivo') ?? '0').replace(',', '.')) || 0)
  if (!nome) msg('Dê um nome ao pote.', 'potinhos')
  if (!(objetivo > 0)) msg('Informe quanto quer juntar.', 'potinhos')
  const cores = ['#2EC4A0', '#4CC9F0', '#7B6CF6', '#FFC93C']
  const { count } = await supabase.from('metas_poupanca').select('id', { count: 'exact', head: true }).eq('escopo', 'pessoal')
  const cor = cores[(count ?? 0) % cores.length]
  const { error } = await supabase.from('metas_poupanca').insert({
    nome, cor, atual: 0, objetivo, escopo: 'pessoal',
  })
  if (error) msg('Não deu para criar o pote: ' + error.message, 'potinhos')
  revalidatePath(VOLTAR)
  msg(`Pote ${nome} criado.`, 'potinhos')
}
