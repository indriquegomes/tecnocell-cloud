import { createServiceClient } from '@/lib/supabase/server'
import { chamarML } from '@/lib/mercado-livre'
import type { NextRequest } from 'next/server'

type Notificacao = { topic: string; resource: string; user_id: number; sent: string }
type PedidoML = {
  id: number
  status: string
  total_amount: number
  buyer: { nickname: string }
  order_items: { item: { id: string }; quantity: number; unit_price: number }[]
}
type PerguntaML = { id: number; item_id: string; text: string; status: string }

export async function POST(req: NextRequest) {
  let body: Notificacao
  try {
    body = await req.json()
  } catch {
    return new Response('ok', { status: 200 }) // corpo ilegível — não é nosso problema, so 200 e ignora
  }

  // `resource` vem do corpo, que qualquer um pode forjar (ML não assina o
  // payload — ver comentário acima). `chamarML` manda o token de acesso pra
  // qualquer URL que comece com "http", então sem essa validação um resource
  // tipo "https://attacker.example/x" vaza o token do Mercado Livre pro
  // atacante. ML só manda o formato "/orders/123" ou "/questions/123" —
  // qualquer coisa fora disso é tratada como payload não confiável, mesmo
  // esquema do corpo ilegível acima (200 silencioso, sem processar).
  if (!/^\/(orders|questions)\/\d+$/.test(body.resource)) {
    return new Response('ok', { status: 200 })
  }

  const supabase = await createServiceClient()

  try {
    if (body.topic === 'orders_v2') await processarPedido(supabase, body)
    else if (body.topic === 'questions') await processarPergunta(supabase, body)
    // outros topics (ex: 'messages', adicionado na Tarefa 10) entram como novo `else if` aqui
    return new Response('ok', { status: 200 })
  } catch (e) {
    // Falha ao buscar o pedido na API do ML, token indisponível, etc. — não
    // temos o pedido completo pra gravar pendência com dado real; loga e
    // segue. Mercado Livre não reenvia automaticamente pra topic orders_v2
    // depois de um tempo, mas reenviar não ajudaria numa falha de rede.
    console.error('Erro processando webhook do Mercado Livre:', e)
    return new Response('ok', { status: 200 })
  }
}

async function processarPedido(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  body: Notificacao,
) {
  const pedido = await chamarML<PedidoML>(body.resource)
  if (pedido.status !== 'paid') return

  const { data: jaExiste } = await supabase
    .from('vendas')
    .select('id')
    .eq('ml_order_id', String(pedido.id))
    .maybeSingle()
  if (jaExiste) return // idempotencia

  const { data: jaPendente } = await supabase
    .from('integracoes_mercado_livre_pedidos_pendentes')
    .select('id')
    .eq('ml_order_id', String(pedido.id))
    .maybeSingle()
  if (jaPendente) return

  const mlItemIds = pedido.order_items.map((i) => i.item.id)
  const { data: anuncios } = await supabase
    .from('integracoes_mercado_livre_anuncios')
    .select('ml_item_id, produto_id')
    .in('ml_item_id', mlItemIds)
  const produtoPorItem = new Map((anuncios ?? []).map((a) => [a.ml_item_id, a.produto_id]))

  const itemSemProduto = pedido.order_items.find((i) => !produtoPorItem.get(i.item.id))
  if (itemSemProduto) {
    await registrarPendencia(supabase, pedido, 'Item sem produto correspondente cadastrado')
    return
  }

  const itens = pedido.order_items.map((i) => ({
    produto_id: produtoPorItem.get(i.item.id),
    nome: i.item.id,
    quantidade: i.quantity,
    preco_unitario: i.unit_price,
  }))

  const DEPOSITO_PETROPOLIS_LOJA = '63d9054d59a9c829747233d4'
  const { data, error } = await supabase.rpc('finalizar_venda', {
    p_itens: itens,
    p_pagamentos: [{ forma_pagamento_id: 'FP_MERCADOLIVRE', valor: pedido.total_amount, taxa: 0, status: 'pago' }],
    p_pessoa_id: null,
    p_desconto: 0,
    p_observacoes: `Pedido Mercado Livre #${pedido.id} — comprador: ${pedido.buyer.nickname}`,
    p_deposito_id: DEPOSITO_PETROPOLIS_LOJA,
  })

  if (error || !data) {
    await registrarPendencia(supabase, pedido, error?.message ?? 'finalizar_venda retornou vazio')
    return
  }

  // Sem UPDATE de caixa_id de propósito — venda do ML nunca entra na
  // conferência de caixa físico (ver spec, Peça 3).
  await supabase.from('vendas').update({ ml_order_id: String(pedido.id) }).eq('id', data.venda_id as string)
}

async function registrarPendencia(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  pedido: PedidoML,
  motivo: string
) {
  await supabase.from('integracoes_mercado_livre_pedidos_pendentes').insert({
    ml_order_id: String(pedido.id),
    motivo,
    payload: pedido,
  })
}

async function processarPergunta(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  body: Notificacao,
) {
  const pergunta = await chamarML<PerguntaML>(body.resource)
  await supabase.from('integracoes_mercado_livre_perguntas').upsert({
    ml_question_id: String(pergunta.id),
    ml_item_id: pergunta.item_id,
    texto: pergunta.text,
    // Só manda `respondida: true` quando o ML confirma que foi respondida.
    // Se vier UNANSWERED, omite a chave — o status do ML é eventualmente
    // consistente, e uma notificação atrasada não pode sobrescrever
    // `respondida: true` de uma pergunta que já respondemos aqui (senão ela
    // volta a aparecer como pendente e responder de novo dá erro no ML).
    ...(pergunta.status !== 'UNANSWERED' ? { respondida: true } : {}),
  }, { onConflict: 'ml_question_id' })
}
