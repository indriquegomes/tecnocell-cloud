'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type PagamentoDetalhe = {
  forma_nome: string
  valor: number
  parcelas: number
  maquina: string | null
  /** dinheiro | pix | cartao_debito | cartao_credito | fiado | vale_credito … */
  tipo: string
  /** pago = dinheiro entrou de verdade · pendente = fiado · vale = saiu do saldo */
  status: string
}

export type DetalheVendaCompleto = {
  id: string
  numero: number | null
  total: number
  desconto: number
  created_at: string
  status: string
  observacoes: string | null
  vendedor_nome: string | null
  pessoa_id: string | null
  pessoa_nome: string | null
  pagamentos: PagamentoDetalhe[]
  itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number; desconto_item: number; total_item: number }[]
}

export async function buscarDetalheVendaPublic(vendaId: string): Promise<DetalheVendaCompleto | null> {
  await requirePermissao('vendas')
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, pagamentosRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, desconto, created_at, status, observacoes, vendedor_nome, pessoa_id')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('produto_id, quantidade, preco_unitario, desconto_item, total_item')
      .eq('venda_id', vendaId),
    supabase
      .from('pagamentos_venda')
      .select('forma_pagamento_id, valor, parcelas, maquina, status')
      .eq('venda_id', vendaId),
  ])

  if (!vendaRes.data) return null
  const v = vendaRes.data as {
    id: string; numero: number | null; total: number; desconto: number
    created_at: string; status: string; observacoes: string | null
    vendedor_nome: string | null; pessoa_id: string | null
  }

  // Nomes de formas de pagamento
  const formaIds = [...new Set((pagamentosRes.data ?? []).map((p: { forma_pagamento_id: string }) => p.forma_pagamento_id).filter(Boolean))]
  let formaMap: Record<string, string> = {}
  // tipo da forma: é ele que diz COMO devolver o dinheiro se a venda for
  // cancelada (gaveta, PIX de volta, estorno na maquininha) — o nome sozinho
  // não serve, porque a loja renomeia forma ("TON 2", "PIX Teresópolis"…).
  let tipoMap: Record<string, string> = {}
  if (formaIds.length > 0) {
    const { data: formas } = await supabase.from('formas_pagamento').select('id, nome, tipo').in('id', formaIds)
    formaMap = Object.fromEntries((formas ?? []).map(f => [f.id, f.nome]))
    tipoMap = Object.fromEntries((formas ?? []).map(f => [f.id, (f as { tipo: string | null }).tipo ?? 'outros']))
  }

  // Nome do cliente
  let pessoaNome: string | null = null
  if (v.pessoa_id) {
    const { data: p } = await supabase.from('pessoas').select('nome').eq('id', v.pessoa_id).maybeSingle()
    pessoaNome = (p as { nome: string } | null)?.nome ?? null
  }

  // Nomes dos produtos
  const produtoIds = [...new Set((itensRes.data ?? []).map((i: { produto_id: string }) => i.produto_id).filter(Boolean))]
  let produtoMap: Record<string, string> = {}
  if (produtoIds.length > 0) {
    const { data: prods } = await supabase.from('produtos').select('id, nome').in('id', produtoIds)
    produtoMap = Object.fromEntries((prods ?? []).map(p => [p.id, p.nome]))
  }

  return {
    id: v.id,
    numero: v.numero,
    total: v.total,
    desconto: v.desconto ?? 0,
    created_at: v.created_at,
    status: v.status,
    observacoes: v.observacoes,
    vendedor_nome: v.vendedor_nome,
    pessoa_id: v.pessoa_id,
    pessoa_nome: pessoaNome,
    pagamentos: (pagamentosRes.data ?? []).map((p: { forma_pagamento_id: string; valor: number; parcelas: number; maquina: string | null; status: string | null }) => ({
      forma_nome: formaMap[p.forma_pagamento_id] ?? p.forma_pagamento_id,
      valor: p.valor,
      parcelas: p.parcelas ?? 1,
      maquina: p.maquina,
      tipo: tipoMap[p.forma_pagamento_id] ?? 'outros',
      status: p.status ?? 'pago',
    })),
    itens: (itensRes.data ?? []).map((i: { produto_id: string; quantidade: number; preco_unitario: number; desconto_item: number; total_item: number }) => ({
      produto_id: i.produto_id,
      nome: produtoMap[i.produto_id] ?? '—',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      desconto_item: i.desconto_item ?? 0,
      total_item: i.total_item,
    })),
  }
}

// ============================================================
// CANCELAR VENDA — a venda não deveria ter existido (erro de digitação, teste,
// desistência antes de entregar). Diferente da Devolução, que é o cliente trazendo
// a peça de volta e virando crédito/reembolso.
//
// Tudo dentro do RPC cancelar_venda (atômico): devolve estoque, devolve IMEIs,
// apaga os lançamentos (sai do A Receber/caixa), estorna o crédito usado e marca
// a venda como 'cancelada'. A venda NÃO é apagada — fica no histórico.
//
// Idempotente: cancelar 2x não devolve estoque em dobro (o RPC recusa a 2ª).
// ============================================================
export type ResultadoCancelamento =
  | { ok: true; jaCancelada: boolean; numero: number | null; estoqueDevolvido: number; imeis: number; creditoEstornado: number }
  | { ok: false; erro: string }

export async function cancelarVenda(
  vendaId: string,
  motivo: string,
  motivoTipo?: string,
): Promise<ResultadoCancelamento> {
  await requirePermissao('vendas')
  const supabase = await createServiceClient()

  // TRAVA: cancelar NÃO devolve dinheiro — só desfaz estoque, dívida e crédito.
  // Se a venda já recebeu dinheiro de verdade, cancelar deixaria o valor solto
  // (na gaveta, na conta do PIX ou na maquininha) sem registro nenhum de que
  // ele é do cliente — e o caixa fecharia com sobra que ninguém explica.
  // Pra esse caso o certo é Devolução, que sabe tirar o dinheiro do lugar
  // certo. Ela cobre até o caso de "marquei a forma errada e nada entrou":
  // é só escolher "sem reembolso", que nada sai do caixa.
  const { data: pagos, error: erroPagos } = await supabase
    .from('pagamentos_venda')
    .select('valor, status, formas_pagamento(nome, tipo)')
    .eq('venda_id', vendaId)
  if (erroPagos) return { ok: false, erro: 'Não deu pra conferir as formas de pagamento desta venda: ' + erroPagos.message }

  // o embed do PostgREST às vezes vem como array, às vezes como objeto
  type FormaEmbed = { nome: string | null; tipo: string | null }
  const daForma = (p: unknown): FormaEmbed | null => {
    const f = (p as { formas_pagamento?: FormaEmbed | FormaEmbed[] | null }).formas_pagamento
    return Array.isArray(f) ? (f[0] ?? null) : (f ?? null)
  }

  const comDinheiro = (pagos ?? []).filter((p) => {
    const tipo = daForma(p)?.tipo ?? 'outros'
    // fiado = dívida (não entrou); vale = saldo do cliente (o RPC já estorna)
    return (p as { status: string | null }).status === 'pago' && tipo !== 'fiado' && tipo !== 'vale_credito'
  })

  if (comDinheiro.length > 0) {
    const lista = comDinheiro
      .map((p) => {
        const v = Number((p as { valor: number | null }).valor ?? 0)
        return `${daForma(p)?.nome ?? 'forma desconhecida'} R$ ${v.toFixed(2).replace('.', ',')}`
      })
      .join(' + ')
    return {
      ok: false,
      erro: `Esta venda já recebeu dinheiro (${lista}). Cancelar não devolve esse valor — use Devolução, que tira o dinheiro do lugar certo. Se na verdade nada foi pago, faça a Devolução escolhendo "sem reembolso".`,
    }
  }

  const { data, error } = await supabase.rpc('cancelar_venda', {
    p_venda_id: vendaId,
    p_motivo: motivo?.trim() || null,
  })
  if (error) return { ok: false, erro: error.message }

  // O motivo fechado e um ROTULO, nao dinheiro — grava fora do RPC (que mexe em estoque,
  // IMEI, lancamento e credito numa transacao atomica). Nao vale o risco de mexer nele
  // so pra carregar uma etiqueta.
  if (motivoTipo) {
    await supabase.from('vendas').update({ motivo_cancelamento: motivoTipo }).eq('id', vendaId)
  }

  const d = (data ?? {}) as {
    ja_cancelada?: boolean
    venda_numero?: number | null
    estoque_devolvido?: number
    imeis_devolvidos?: number
    credito_estornado?: number
  }
  revalidatePath('/painel/vendas')
  revalidatePath('/painel/estoque')
  revalidatePath('/painel/financeiro')
  revalidatePath('/painel')
  return {
    ok: true,
    jaCancelada: !!d.ja_cancelada,
    numero: d.venda_numero ?? null,
    estoqueDevolvido: Number(d.estoque_devolvido) || 0,
    imeis: Number(d.imeis_devolvidos) || 0,
    creditoEstornado: Number(d.credito_estornado) || 0,
  }
}
