import { createServiceClient } from '@/lib/supabase/server'
import { parseSaveVenda, mapFormaSige, DEPOSITO_POR_EMPRESA, parseSaveCrediario, parseMovimentacaoEstoque, parseDevolucao } from '@/lib/sinc'
import type { NextRequest } from 'next/server'

// Worker da sincronização (Fase 4). Roda por Vercel Cron (ou manual GET).
//
// Lê eventos pendentes da sinc_inbox, classifica pelo endpoint e aplica via
// RPC (MESMO motor da interface). Por enquanto só o savevenda; os demais
// endpoints vão pra quarentena com "endpoint ainda não tratado" (não bloqueiam
// a fila — evita starvation).
//
// Idempotência em 2 níveis:
//   1. reivindicação atômica: update estado='processando' WHERE estado='pendente'
//      (só um worker processa cada evento);
//   2. checagem de sinc_mapeamento antes do RPC (se caiu após o RPC, não reaplica).

const LIMITE = 20
const STUCK_MINUTOS = 10

async function quarentena(supabase: Awaited<ReturnType<typeof createServiceClient>>, ev: { id: string; loja: string }, motivo: string) {
  await supabase.from('sinc_inbox').update({ estado: 'quarentena', erro: motivo.slice(0, 500) }).eq('id', ev.id)
  await supabase.from('sinc_auditoria').insert({ evento_id: ev.id, entidade: 'api', loja: ev.loja, acao: 'capturado', resultado: 'quarentena', detalhe: motivo.slice(0, 500) })
}

export async function GET(req: NextRequest) {
  // CRON_SECRET: se configurado, exige o header que o Vercel Cron manda.
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Recupera eventos presos em 'processando' (worker caiu no meio).
  const corte = new Date(Date.now() - STUCK_MINUTOS * 60000).toISOString()
  await supabase.from('sinc_inbox').update({ estado: 'pendente' }).eq('estado', 'processando').lt('recebido_em', corte)

  const { data: candidatos } = await supabase
    .from('sinc_inbox')
    .select('*')
    .eq('estado', 'pendente')
    .order('recebido_em', { ascending: true })
    .limit(LIMITE)

  if (!candidatos || candidatos.length === 0) {
    return Response.json({ processados: 0, aplicados: 0, quarentena: 0 })
  }

  let aplicados = 0
  let quarentenados = 0

  for (const ev of candidatos) {
    // Reivindica atomicamente (só 1 worker processa).
    const { data: reivindicado } = await supabase
      .from('sinc_inbox')
      .update({ estado: 'processando' })
      .eq('id', ev.id)
      .eq('estado', 'pendente')
      .select('id')
    if (!reivindicado || reivindicado.length === 0) continue

    const payload = (ev.payload ?? {}) as Record<string, unknown>
    const rota = String(payload.rota ?? '')

    if (/\/EstoqueMovimentacoes\/save-movimentacao$/i.test(rota)) {
      const movimentos = parseMovimentacaoEstoque(payload.corpo as Record<string, unknown>)
      if (!movimentos) {
        await quarentena(supabase, ev, 'movimentação de estoque inválida')
        quarentenados++
        continue
      }
      const normalizados = []
      let valido = true
      for (const mov of movimentos) {
        const { data: produto } = await supabase.from('produtos').select('id').eq('codigo', mov.codigo).maybeSingle()
        if (!produto) {
          await quarentena(supabase, ev, 'produto não encontrado (codigo ' + mov.codigo + ')')
          quarentenados++
          valido = false
          break
        }
        normalizados.push({ produto_id: produto.id, deposito_id: mov.depositoId, operacao: mov.operacao, quantidade: mov.quantidade, data: mov.data, observacao: mov.observacao })
      }
      if (!valido) continue
      const { error } = await supabase.rpc('aplicar_movimento_estoque_sige', {
        p_evento_id: ev.id,
        p_loja: ev.loja,
        p_sequencia: ev.sequencia ?? 0,
        p_movimentos: normalizados,
      })
      if (error) {
        await quarentena(supabase, ev, 'RPC estoque: ' + error.message)
        quarentenados++
      } else aplicados++
      continue
    }

    // Receber fiado (SaveCrediario) — atualiza o lançamento (caixa fica pro passo 4).
    if (/\/SaveCrediario$/i.test(rota)) {
      const receb = parseSaveCrediario(payload.corpo as Record<string, unknown>)
      if (!receb || receb.lancamentos.length === 0) {
        await quarentena(supabase, ev, 'SaveCrediario inválido')
        quarentenados++
        continue
      }
      const hoje = new Date().toISOString()
      let achou = false
      for (const lc of receb.lancamentos) {
        const { data: lanc } = await supabase.from('lancamentos').select('id, valor, valor_pago').eq('id', lc.id).maybeSingle()
        if (!lanc) continue // dívida ainda não sincronizada (baseline)
        achou = true
        const novoPago = (Number(lanc.valor_pago) || 0) + receb.valorPago
        const quitado = novoPago >= (Number(lanc.valor) || 0) - 0.01
        await supabase
          .from('lancamentos')
          .update({ valor_pago: Math.round(novoPago * 100) / 100, status: quitado ? 'pago' : 'pendente', data_pagamento: hoje, forma_pagamento: receb.forma, updated_at: hoje })
          .eq('id', lc.id)
      }
      await supabase.from('sinc_inbox').update({ estado: 'aplicado', aplicado_em: hoje }).eq('id', ev.id)
      await supabase.from('sinc_auditoria').insert({ evento_id: ev.id, entidade: 'fiado', loja: ev.loja, acao: 'receber', resultado: achou ? 'ok' : 'quarentena', detalhe: 'recebido ' + receb.valorPago })
      if (achou) aplicados++
      else { await quarentena(supabase, ev, 'lançamento de fiado não encontrado'); quarentenados++ }
      continue
    }

    // Devolução de mercadoria (OperacoesPDV/Salvar). "Cancelamento" no SIGE não tem
    // endpoint próprio — devolver tudo É o cancelamento (a venda vira "Pedido
    // Cancelado"), então este ramo cobre os dois.
    if (/\/OperacoesPDV\/Salvar$/i.test(rota)) {
      const dev = parseDevolucao(payload.corpo as Record<string, unknown>, payload.resposta)
      if (!dev) {
        await quarentena(supabase, ev, 'devolução inválida ou falhou no SIGE (sem OperacaoId)')
        quarentenados++
        continue
      }
      if (!dev.tipoCredito) {
        await quarentena(supabase, ev, 'forma de reembolso não mapeada: ' + (dev.forma || '(vazia)'))
        quarentenados++
        continue
      }
      // Idempotência: já aplicada antes (worker caiu após o RPC)?
      const { data: jaDev } = await supabase
        .from('sinc_mapeamento')
        .select('tecno_id')
        .eq('entidade', 'devolucao').eq('sige_id', dev.operacaoId).eq('loja', ev.loja)
        .maybeSingle()
      if (jaDev) {
        await supabase.from('sinc_inbox').update({ estado: 'aplicado', aplicado_em: new Date().toISOString() }).eq('id', ev.id)
        aplicados++
        continue
      }
      // Venda pai precisa já estar sincronizada (ordem trocada → quarentena).
      const { data: vendaMap } = await supabase
        .from('sinc_mapeamento')
        .select('tecno_id')
        .eq('entidade', 'venda').eq('sige_id', dev.vendaIdSige).eq('loja', ev.loja)
        .maybeSingle()
      if (!vendaMap) {
        await quarentena(supabase, ev, 'venda pai não sincronizada (ordem trocada): ' + dev.vendaIdSige)
        quarentenados++
        continue
      }
      const vendaId = vendaMap.tecno_id as string

      // Itens → produto_id (por código, igual savevenda).
      const itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[] = []
      let itemOk = true
      for (const i of dev.itens) {
        const { data: prod } = await supabase.from('produtos').select('id, nome').eq('codigo', i.codigo).maybeSingle()
        if (!prod) {
          await quarentena(supabase, ev, 'produto não encontrado (codigo ' + i.codigo + ')')
          quarentenados++
          itemOk = false
          break
        }
        itens.push({ produto_id: prod.id, nome: prod.nome, quantidade: i.quantidade, preco_unitario: i.valorUnitario, total_item: i.totalItem, status_produto: 'ok' })
      }
      if (!itemOk) continue

      // Pessoa: reaproveita a pessoa da venda já sincronizada (SIGE não manda CPF na devolução).
      const { data: venda } = await supabase.from('vendas').select('pessoa_id, vendedor_nome').eq('id', vendaId).maybeSingle()
      const pessoaId = venda?.pessoa_id ?? null

      const { data: rpc, error: devErr } = await supabase.rpc('registrar_devolucao', {
        p_venda_id: vendaId,
        p_deposito_id: dev.depositoId,
        p_pessoa_id: pessoaId,
        p_pessoa_nome: dev.clienteNome || null,
        p_vendedor_nome: venda?.vendedor_nome ?? null,
        p_motivo: 'Devolução SIGE',
        p_tipo_credito: dev.tipoCredito,
        p_itens: itens,
        p_lancamento_pendente: false,
        p_series: [],
      })
      if (devErr) {
        await quarentena(supabase, ev, 'RPC devolução: ' + devErr.message)
        quarentenados++
        continue
      }
      const devolucaoId = (rpc as { devolucao_id?: string } | null)?.devolucao_id ?? ''
      const agora = new Date().toISOString()
      await supabase.from('sinc_inbox').update({ estado: 'aplicado', aplicado_em: agora }).eq('id', ev.id)
      await supabase
        .from('sinc_mapeamento')
        .upsert({ entidade: 'devolucao', sige_id: dev.operacaoId, loja: ev.loja, tecno_id: devolucaoId, ultima_sequencia: ev.sequencia ?? 0, atualizado_em: agora }, { onConflict: 'entidade,sige_id,loja' })
      await supabase
        .from('sinc_auditoria')
        .insert({ evento_id: ev.id, entidade: 'devolucao', sige_id: dev.operacaoId, loja: ev.loja, acao: 'create', resultado: 'ok', detalhe: dev.tipoCredito + ' — ' + itens.length + ' itens' })
      aplicados++
      continue
    }

    // Só savevenda por enquanto; demais vão pra quarentena (não travam a fila).
    if (!/\/savevenda$/i.test(rota)) {
      await quarentena(supabase, ev, 'endpoint ainda não tratado: ' + rota.slice(-60))
      quarentenados++
      continue
    }

    const parsed = parseSaveVenda(payload.corpo as Record<string, unknown>, payload.resposta)
    if (!parsed || !parsed.vendaIdSige) {
      await quarentena(supabase, ev, 'savevenda inválido (sem venda_id ou número malformado)')
      quarentenados++
      continue
    }

    // Idempotência: já aplicado antes (worker caiu após o RPC)?
    const { data: jaAplicado } = await supabase
      .from('sinc_mapeamento')
      .select('tecno_id')
      .eq('entidade', 'venda').eq('sige_id', parsed.vendaIdSige).eq('loja', ev.loja)
      .maybeSingle()
    if (jaAplicado) {
      await supabase.from('sinc_inbox').update({ estado: 'aplicado', aplicado_em: new Date().toISOString() }).eq('id', ev.id)
      aplicados++
      continue
    }

    const empresa = parsed.itens[0]?.empresa ?? ''
    const depositoId = DEPOSITO_POR_EMPRESA[empresa]
    if (!depositoId) {
      await quarentena(supabase, ev, 'empresa sem depósito: ' + empresa)
      quarentenados++
      continue
    }

    const pagamentos: { forma_pagamento_id: string; valor: number; taxa: number; maquina: null; parcelas: number; status: string }[] = []
    let creditoValor = 0
    let formaOk = true
    for (const p of parsed.pagamentos) {
      // Vale Crédito = abatimento de saldo do cliente, NÃO pagamento (não entra na gaveta).
      if (p.forma === 'Vale Crédito') {
        creditoValor += p.valor
        continue
      }
      const m = mapFormaSige(p.forma)
      if (!m) {
        await quarentena(supabase, ev, 'forma de pagamento não mapeada: ' + p.forma)
        quarentenados++
        formaOk = false
        break
      }
      pagamentos.push({ forma_pagamento_id: m.formaId, valor: p.valor, taxa: 0, maquina: null, parcelas: p.parcelas, status: m.status })
    }
    if (!formaOk) continue

    const itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number }[] = []
    let itemOk = true
    for (const i of parsed.itens) {
      const { data: prod } = await supabase.from('produtos').select('id, nome').eq('codigo', i.codigo).maybeSingle()
      if (!prod) {
        await quarentena(supabase, ev, 'produto não encontrado (codigo ' + i.codigo + ')')
        quarentenados++
        itemOk = false
        break
      }
      itens.push({ produto_id: prod.id, nome: prod.nome, quantidade: i.quantidade, preco_unitario: i.valorUnitario })
    }
    if (!itemOk) continue

    let pessoaId: string | null = null
    if (parsed.cliente?.cpfCnpj) {
      const cpf = parsed.cliente.cpfCnpj.replace(/\D/g, '')
      if (cpf) {
        const { data: pes } = await supabase.from('pessoas').select('id').eq('cpf_cnpj', cpf).maybeSingle()
        pessoaId = pes?.id ?? null
      }
    }

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
      p_credito_valor: creditoValor,
    })

    if (rpcError) {
      await quarentena(supabase, ev, 'RPC: ' + rpcError.message)
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

  return Response.json({ processados: candidatos.length, aplicados, quarentena: quarentenados })
}
