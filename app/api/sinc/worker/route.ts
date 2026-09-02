import { createServiceClient } from '@/lib/supabase/server'
import { parseSaveVenda, mapFormaSige, DEPOSITO_POR_EMPRESA } from '@/lib/sinc'
import type { NextRequest } from 'next/server'

// Worker da sincronização (Fase 4). Roda por Vercel Cron (ou manual GET).
//
// Lê eventos pendentes da sinc_inbox, classifica pelo endpoint e aplica via
// RPC (MESMO motor da interface — decisão do dono). Por enquanto só processa
// o savevenda (finalizar venda do SIGE). Os demais endpoints entram depois.
//
// Segurança (lista branca): forma de pagamento não mapeada → quarentena.
// Produto não encontrado / empresa sem depósito → quarentena. Nunca força.
//
// TODO (próximas fases):
//   - criar pessoa quando o cliente do SIGE não existir (Fase 2 bootstrap);
//   - mapear vendedor (email → perfis.id);
//   - cancelamento, caixa, estoque (outros endpoints).

const LIMITE = 20

async function quarentena(supabase: Awaited<ReturnType<typeof createServiceClient>>, eventoId: string, motivo: string) {
  await supabase
    .from('sinc_inbox')
    .update({ estado: 'quarentena', erro: motivo.slice(0, 500) })
    .eq('id', eventoId)
  await supabase
    .from('sinc_auditoria')
    .insert({ evento_id: eventoId, entidade: 'api', loja: '', acao: 'capturado', resultado: 'quarentena', detalhe: motivo.slice(0, 500) })
}

export async function GET(_req: NextRequest) {
  const supabase = await createServiceClient()

  const { data: eventos, error } = await supabase
    .from('sinc_inbox')
    .select('*')
    .eq('estado', 'pendente')
    .order('recebido_em', { ascending: true })
    .limit(LIMITE)

  if (error || !eventos || eventos.length === 0) {
    return Response.json({ processados: 0, aplicados: 0, quarentena: 0 })
  }

  let aplicados = 0
  let quarentenados = 0

  for (const ev of eventos) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>
    const rota = String(payload.rota ?? '')

    // Só savevenda por enquanto; outros endpoints ficam pendentes.
    if (!/\/savevenda$/i.test(rota)) continue

    const parsed = parseSaveVenda(payload.corpo as Record<string, unknown>, payload.resposta)
    if (!parsed || !parsed.vendaIdSige) {
      await quarentena(supabase, ev.id, 'savevenda sem venda_id')
      quarentenados++
      continue
    }

    // Idempotência (Porta 2): se o worker caiu depois do RPC mas antes de marcar
    // 'aplicado', o evento fica 'pendente' e seria re-aplicado. Checa o mapeamento
    // antes de chamar o RPC de novo — nunca cria a mesma venda duas vezes.
    const { data: jaAplicado } = await supabase
      .from('sinc_mapeamento')
      .select('tecno_id')
      .eq('entidade', 'venda')
      .eq('sige_id', parsed.vendaIdSige)
      .eq('loja', ev.loja)
      .maybeSingle()
    if (jaAplicado) {
      await supabase.from('sinc_inbox').update({ estado: 'aplicado', aplicado_em: new Date().toISOString() }).eq('id', ev.id)
      aplicados++
      continue
    }

    // De-para depósito pela empresa do primeiro item.
    const empresa = parsed.itens[0]?.empresa ?? ''
    const depositoId = DEPOSITO_POR_EMPRESA[empresa]
    if (!depositoId) {
      await quarentena(supabase, ev.id, 'empresa sem depósito: ' + empresa)
      quarentenados++
      continue
    }

    // De-para formas (lista branca).
    const pagamentos: { forma_pagamento_id: string; valor: number; taxa: number; maquina: null; parcelas: number; status: string }[] = []
    let formaOk = true
    for (const p of parsed.pagamentos) {
      const m = mapFormaSige(p.forma)
      if (!m) {
        await quarentena(supabase, ev.id, 'forma de pagamento não mapeada: ' + p.forma)
        quarentenados++
        formaOk = false
        break
      }
      pagamentos.push({ forma_pagamento_id: m.formaId, valor: p.valor, taxa: 0, maquina: null, parcelas: p.parcelas, status: m.status })
    }
    if (!formaOk) continue

    // De-para produtos (por codigo). Não achou → quarentena.
    const itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number }[] = []
    let itemOk = true
    for (const i of parsed.itens) {
      const { data: prod } = await supabase.from('produtos').select('id, nome').eq('codigo', i.codigo).maybeSingle()
      if (!prod) {
        await quarentena(supabase, ev.id, 'produto não encontrado (codigo ' + i.codigo + ')')
        quarentenados++
        itemOk = false
        break
      }
      itens.push({ produto_id: prod.id, nome: prod.nome, quantidade: i.quantidade, preco_unitario: i.valorUnitario })
    }
    if (!itemOk) continue

    // Cliente: linka por CPF/CNPJ se existir (criação fica pra Fase 2).
    let pessoaId: string | null = null
    if (parsed.cliente?.cpfCnpj) {
      const cpf = parsed.cliente.cpfCnpj.replace(/\D/g, '')
      if (cpf) {
        const { data: pes } = await supabase.from('pessoas').select('id').eq('cpf_cnpj', cpf).maybeSingle()
        pessoaId = pes?.id ?? null
      }
    }

    // Desconto derivado: subtotal - soma dos pagamentos. Garante a trava do RPC.
    const subtotal = itens.reduce((acc, i) => acc + i.quantidade * i.preco_unitario, 0)
    const somaPagamentos = pagamentos.reduce((acc, p) => acc + p.valor, 0)
    const desconto = Math.max(0, subtotal - somaPagamentos)

    const { data: rpc, error: rpcError } = await supabase.rpc('finalizar_venda', {
      p_itens: itens,
      p_pagamentos: pagamentos,
      p_pessoa_id: pessoaId,
      p_desconto: desconto,
      p_observacoes: 'SIGE ' + parsed.vendaIdSige,
      p_deposito_id: depositoId,
      p_series: [],
      p_vendedor_id: null,
      p_vendedor_nome: parsed.itens[0]?.vendedorEmail ?? null,
      p_credito_valor: 0,
    })

    if (rpcError) {
      await quarentena(supabase, ev.id, 'RPC: ' + rpcError.message)
      quarentenados++
      continue
    }

    const vendaId = (rpc as { venda_id?: string }).venda_id ?? ''

    await supabase.from('sinc_inbox').update({ estado: 'aplicado', aplicado_em: new Date().toISOString() }).eq('id', ev.id)
    await supabase
      .from('sinc_mapeamento')
      .upsert({ entidade: 'venda', sige_id: parsed.vendaIdSige, loja: ev.loja, tecno_id: vendaId, ultima_sequencia: ev.sequencia ?? 0, atualizado_em: new Date().toISOString() }, { onConflict: 'entidade,sige_id,loja' })
    await supabase
      .from('sinc_auditoria')
      .insert({ evento_id: ev.id, entidade: 'venda', sige_id: parsed.vendaIdSige, loja: ev.loja, acao: 'create', resultado: 'ok', detalhe: 'venda_id ' + vendaId })

    aplicados++
  }

  return Response.json({ processados: eventos.length, aplicados, quarentena: quarentenados })
}
