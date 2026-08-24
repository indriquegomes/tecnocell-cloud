'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { logAtividade } from '@/lib/log-atividade'
import { sincronizarEstoqueML } from '@/lib/mercado-livre'

export interface ItemVendaParaDevolucao {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  total_item: number
  series: string[]   // IMEIs vendidos deste produto nesta venda (vazio p/ não serializado)
}

export interface VendaParaDevolucao {
  id: string
  numero: number | null
  total: number
  taxa_cartao: number   // taxa de cartão embutida no total — NÃO reembolsável na devolução
  created_at: string
  pessoa_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  deposito_id: string | null
  deposito_nome: string | null
  forma_pagamento_nome: string | null
  lancamento_pendente: boolean
  fiado_restante: number   // quanto da venda ainda é dívida (fiado em aberto)
  itens: ItemVendaParaDevolucao[]
}

export interface DevolucaoResumo {
  id: string
  venda_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  valor_total: number
  tipo_credito: string
  motivo: string | null
  created_at: string
}

export interface VendaResumo {
  id: string
  numero: number | null
  pessoa_nome: string | null
  total: number
  created_at: string
}

export async function buscarVendaParaDevolucao(
  accessToken: string,
  vendaId: string,
): Promise<VendaParaDevolucao | null> {
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, lancRes, seriesRes, pagRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, created_at, vendedor_nome, forma_pagamento_id, pessoa_id, deposito_id, pessoas!pessoa_id(nome)')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produto_id, produtos(nome)')
      .eq('venda_id', vendaId),
    supabase
      .from('lancamentos')
      .select('id, status, valor, valor_pago')
      .eq('tipo', 'receber')
      .eq('status', 'pendente')
      .eq('venda_id', vendaId),
    supabase
      .from('numeros_serie')
      .select('produto_id, serie')
      .eq('venda_id', vendaId)
      .eq('status', 'vendido'),
    supabase
      .from('pagamentos_venda')
      .select('taxa')
      .eq('venda_id', vendaId),
  ])

  // IMEIs vendidos agrupados por produto (aparelhos serializados desta venda)
  const seriesPorProduto: Record<string, string[]> = {}
  for (const s of (seriesRes.data ?? []) as { produto_id: string; serie: string }[]) {
    ;(seriesPorProduto[s.produto_id] ??= []).push(s.serie)
  }

  if (!vendaRes.data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vRaw = vendaRes.data as any
  const pessoaNome = (vRaw.pessoas?.nome ?? vRaw.vendedor_nome ?? null) as string | null
  // Taxa de cartão embutida no total (repasse do custo da maquininha). NÃO é valor de
  // produto → não reembolsa na devolução (pedido Isa 28/07): a base do reembolso é
  // `total − taxa`. Cartão TON etc. gravam taxa em pagamentos_venda; dinheiro/fiado = 0.
  const taxaCartao = ((pagRes.data ?? []) as { taxa: number | null }[]).reduce((s, p) => s + (p.taxa ?? 0), 0)

  const [formaRes, depositoRes] = await Promise.all([
    vRaw.forma_pagamento_id
      ? supabase.from('formas_pagamento').select('nome').eq('id', vRaw.forma_pagamento_id).maybeSingle()
      : Promise.resolve({ data: null }),
    vRaw.deposito_id
      ? supabase.from('depositos').select('nome').eq('id', vRaw.deposito_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    id: vRaw.id,
    numero: vRaw.numero ?? null,
    total: vRaw.total,
    taxa_cartao: taxaCartao,
    created_at: vRaw.created_at,
    pessoa_id: (vRaw.pessoa_id ?? null) as string | null,
    pessoa_nome: pessoaNome,
    vendedor_nome: vRaw.vendedor_nome ?? null,
    deposito_id: (vRaw.deposito_id ?? null) as string | null,
    deposito_nome: (depositoRes as { data: { nome: string } | null }).data?.nome ?? null,
    forma_pagamento_nome: (formaRes as { data: { nome: string } | null }).data?.nome ?? null,
    lancamento_pendente: (lancRes.data ?? []).length > 0,
    fiado_restante: (lancRes.data ?? []).reduce(
      (s, l) => s + (((l as { valor: number | null }).valor ?? 0) - ((l as { valor_pago: number | null }).valor_pago ?? 0)),
      0,
    ),
    itens: ((itensRes.data ?? []) as unknown as {
      produto_id: string; quantidade: number; preco_unitario: number
      total_item: number; produtos: { nome: string } | null
    }[]).map((i) => ({
      produto_id: i.produto_id,
      nome: i.produtos?.nome ?? '—',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total_item: i.total_item,
      series: seriesPorProduto[i.produto_id] ?? [],
    })),
  }
}

export async function buscarVendasRecentes(
  accessToken: string,
  busca: string,
): Promise<VendaResumo[]> {
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()

  // Busca no BANCO (não filtra 50 recentes na memória — assim acha QUALQUER venda):
  // número → busca exata por `numero`; texto → nome do cliente (resolve os ids em pessoas)
  // com fallback pro vendedor. Vazio → as 50 últimas (lista padrão do modal).
  const b = busca.trim()
  const sel = 'id, numero, total, created_at, vendedor_nome, pessoa_id, pessoas!pessoa_id(nome)'
  let vsel
  if (/^\d+$/.test(b)) {
    vsel = await supabase.from('vendas').select(sel).eq('status', 'concluida').eq('numero', Number(b)).limit(20)
  } else if (b) {
    const { data: ps } = await supabase.from('pessoas').select('id').ilike('nome', `%${b}%`).limit(60)
    const pids = (ps ?? []).map((p) => p.id as string)
    vsel = pids.length
      ? await supabase.from('vendas').select(sel).eq('status', 'concluida').in('pessoa_id', pids).order('created_at', { ascending: false }).limit(50)
      : await supabase.from('vendas').select(sel).eq('status', 'concluida').ilike('vendedor_nome', `%${b}%`).order('created_at', { ascending: false }).limit(50)
  } else {
    vsel = await supabase.from('vendas').select(sel).eq('status', 'concluida').order('created_at', { ascending: false }).limit(50)
  }
  const { data, error } = vsel

  if (error) throw new Error(error.message)

  // Esconde vendas já totalmente devolvidas (evita devolução dupla).
  // Soma o valor devolvido por venda e compara com o DEVOLVÍVEL = total − taxa de cartão
  // (a taxa não é reembolsável, então o devolvido máximo é o valor de produto, não o total
  // com taxa — senão a venda toda devolvida reaparecia por causa dos centavos da taxa).
  const ids = (data ?? []).map((v) => v.id as string)
  const devolvidoPorVenda: Record<string, number> = {}
  const taxaPorVenda: Record<string, number> = {}
  if (ids.length) {
    const { data: devs } = await supabase
      .from('devolucoes').select('venda_id, valor_total').in('venda_id', ids)
    for (const d of (devs ?? []) as { venda_id: string | null; valor_total: number | null }[]) {
      if (d.venda_id) devolvidoPorVenda[d.venda_id] = (devolvidoPorVenda[d.venda_id] ?? 0) + (d.valor_total ?? 0)
    }
    const { data: pgs } = await supabase
      .from('pagamentos_venda').select('venda_id, taxa').in('venda_id', ids)
    for (const p of (pgs ?? []) as { venda_id: string | null; taxa: number | null }[]) {
      if (p.venda_id) taxaPorVenda[p.venda_id] = (taxaPorVenda[p.venda_id] ?? 0) + (p.taxa ?? 0)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? [])
    .filter((v: any) => (devolvidoPorVenda[v.id] ?? 0) < ((v.total as number) - (taxaPorVenda[v.id] ?? 0)) - 0.01)
    .map((v: any) => ({
      id: v.id as string,
      numero: v.numero as number | null,
      pessoa_nome: (v.pessoas?.nome ?? v.vendedor_nome ?? null) as string | null,
      total: v.total as number,
      created_at: v.created_at as string,
    }))

  return rows
}

export interface RegistrarDevolucaoInput {
  venda_id: string
  deposito_id: string | null
  pessoa_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  motivo: string
  /** motivo FECHADO (teste | defeito_alegado | cliente_desistiu | peca_errada | outro) */
  motivo_tipo: string
  tipo_credito: string
  itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string; series?: string[] }[]
  lancamento_pendente: boolean
}

export async function registrarDevolucao(
  accessToken: string,
  input: RegistrarDevolucaoInput,
): Promise<{ id: string }> {
  const usuario = await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()

  // Tudo numa transação atômica no RPC (migration 2026-07-03): devolução + itens +
  // retorno ao estoque + financeiro. Falha em qualquer passo reverte o conjunto —
  // sem devolução órfã nem estoque retornado pela metade.
  // IMEIs devolvidos (aparelhos serializados) — cada um com o status escolhido
  const series = input.itens.flatMap((i) =>
    (i.series ?? []).map((serie) => ({ produto_id: i.produto_id, serie, status_produto: i.status_produto })),
  )

  const { data, error } = await supabase.rpc('registrar_devolucao', {
    p_venda_id: input.venda_id,
    p_deposito_id: input.deposito_id,
    p_pessoa_id: input.pessoa_id,
    p_pessoa_nome: input.pessoa_nome,
    p_vendedor_nome: input.vendedor_nome,
    p_motivo: input.motivo,
    p_tipo_credito: input.tipo_credito,
    p_itens: input.itens,
    p_lancamento_pendente: input.lancamento_pendente,
    p_series: series,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('RPC registrar_devolucao retornou vazio.')

  const devolucaoId = (data as { devolucao_id: string }).devolucao_id
  const reembolso = Number((data as { reembolso?: number }).reembolso ?? 0)

  for (const item of input.itens) {
    void sincronizarEstoqueML(item.produto_id)
  }

  // DINHEIRO devolvido SAI DA GAVETA — registra a saída no caixa aberto da loja.
  // O RPC já não cria lançamento financeiro pra dinheiro (migration de 15/07): o
  // dinheiro é evento de CAIXA, não conta a pagar. Aqui fechamos o outro lado —
  // sem isto, a gaveta perdia o dinheiro físico e o sistema não registrava, e o
  // fechamento acusava falta. Débito/crédito/PIX NÃO passam por aqui (não saem da
  // gaveta). Fora do RPC de propósito: uma escrita de caixa não deve reverter a
  // devolução (estoque/crédito) se der ruim — ela é secundária ao ato de devolver.
  if (input.tipo_credito === 'dinheiro' && reembolso > 0.005 && input.deposito_id) {
    const { data: dep, error: erroDep } = await supabase.from('depositos').select('loja_id').eq('id', input.deposito_id).maybeSingle()
    if (erroDep) console.error(`Devolução ${devolucaoId}: reembolso de ${reembolso} em dinheiro sem registro nenhum — falha ao buscar loja do depósito:`, erroDep.message)
    const lojaId = (dep as { loja_id: string | null } | null)?.loja_id ?? null
    if (lojaId) {
      const { data: caixa, error: erroCaixa } = await supabase
        .from('caixas').select('id').eq('status', 'aberto').eq('loja_id', lojaId)
        .order('aberto_em', { ascending: false }).limit(1).maybeSingle()
      if (erroCaixa) console.error(`Devolução ${devolucaoId}: reembolso de ${reembolso} em dinheiro sem registro nenhum — falha ao buscar caixa aberto:`, erroCaixa.message)
      const caixaId = (caixa as { id: string } | null)?.id ?? null
      if (caixaId) {
        const { error: erroMov } = await supabase.from('movimentos_caixa').insert({
          caixa_id: caixaId,
          tipo: 'devolucao',
          forma_pagamento: 'Dinheiro',
          valor: reembolso,
          motivo: `Devolução — ${input.pessoa_nome ?? 'Cliente'}`,
        })
        if (erroMov) console.error(`Devolução ${devolucaoId}: reembolso de ${reembolso} em dinheiro não gravou no caixa:`, erroMov.message)
      } else if (!erroCaixa) {
        // Nenhum caixa aberto nesta loja — o RPC não cria lançamento pra
        // dinheiro (é evento de caixa, não conta a pagar), então sem isto o
        // reembolso não fica registrado em NENHUM lugar. Não trava a
        // devolução por causa disso (estoque/crédito já foram revertidos de
        // verdade), mas precisa ficar visível pra alguém conferir na mão.
        console.error(`Devolução ${devolucaoId}: reembolso de ${reembolso} em dinheiro NÃO tem registro nenhum — nenhum caixa aberto na loja ${lojaId} no momento da devolução.`)
      }
    }
  }

  // O motivo é um RÓTULO, não dinheiro — grava DEPOIS, fora do RPC. Não mexo no
  // registrar_devolucao (que move estoque, crédito e fiado numa transação atômica)
  // só pra carregar uma etiqueta: o risco não compensa.
  if (input.motivo_tipo) {
    await supabase.from('devolucoes').update({ motivo_tipo: input.motivo_tipo }).eq('id', devolucaoId)
  }

  // Câmera de segurança: registra QUEM devolveu, qual venda e quanto. Nunca derruba a
  // devolução se o log falhar (a própria logAtividade engole o erro).
  await logAtividade('devolucao.criar', {
    devolucao_id: devolucaoId,
    venda_id: input.venda_id,
    pessoa_nome: input.pessoa_nome,
    tipo_credito: input.tipo_credito,
    motivo: input.motivo_tipo || input.motivo || null,
    reembolso,
  }, usuario, '/painel/devolucoes')

  return { id: devolucaoId }
}

export async function buscarItensDevolucao(
  accessToken: string,
  devolucaoId: string,
): Promise<{ nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]> {
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('itens_devolucao')
    .select('nome, quantidade, preco_unitario, total_item, status_produto')
    .eq('devolucao_id', devolucaoId)
  return (data ?? []) as { nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]
}
