import { createServiceClient, fetchAll } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createServiceClient>>
export type ContaSaldo = { id: string; saldo_inicial?: number | null; tipo?: string | null; loja_id?: string | null }

// Saldo de cada conta — FONTE ÚNICA (Contas e Financeiro usam esta).
// saldo = saldo_inicial
//   + vendas pagas (pagamentos_venda) roteadas pra conta certa
//   + lançamentos manuais pagos com conta_id (receber +, pagar −)
//   + transferências (destino +, origem −)
//
// Roteamento da venda (o pulo do gato da reclamação da Isa):
//   DINHEIRO  → cai no CAIXA da LOJA da venda (a gaveta é por loja: loja_id)
//   resto     → forma.conta_destino_id (cartão/pix vão pro banco/maquininha)
//   fiado     → não entra (conta_destino null)
// Venda-lançamentos automáticos não têm conta_id → não duplicam com pagamentos_venda.
export async function calcularSaldosContas(supabase: SB, contas: ContaSaldo[]): Promise<Record<string, number>> {
  const saldo: Record<string, number> = {}
  for (const c of contas) saldo[c.id] = Number(c.saldo_inicial ?? 0)
  try {
    // caixa (tipo=caixa) de cada loja → destino do dinheiro daquela loja
    const caixaDaLoja: Record<string, string> = {}
    for (const c of contas) if (c.tipo === 'caixa' && c.loja_id) caixaDaLoja[c.loja_id] = c.id

    const [{ data: formas }, { data: rotaRows }, pv, tr, lc] = await Promise.all([
      supabase.from('formas_pagamento').select('id, tipo, conta_destino_id'),
      supabase.from('forma_conta_loja').select('forma_id, loja_id, conta_id'),   // vazio/inexistente = fallback p/ conta_destino_id
      fetchAll<{ valor: number; taxa: number | null; forma_pagamento_id: string | null; venda_id: string | null }>((from, to) => supabase.from('pagamentos_venda').select('valor, taxa, forma_pagamento_id, venda_id').eq('status', 'pago').range(from, to)),
      fetchAll<{ conta_origem_id: string; conta_destino_id: string; valor: number }>((from, to) => supabase.from('transferencias').select('conta_origem_id, conta_destino_id, valor').range(from, to)),
      fetchAll<{ tipo: string; valor: number; conta_id: string }>((from, to) => supabase.from('lancamentos').select('tipo, valor, conta_id, status').eq('status', 'pago').not('conta_id', 'is', null).range(from, to)),
    ])
    const formaById = Object.fromEntries((formas ?? []).map((f) => [f.id, f as { tipo: string | null; conta_destino_id: string | null }]))

    // Roteamento por loja (Isa): forma + loja da venda → conta daquela loja.
    // Vazio = cai no conta_destino_id (comportamento atual). Backward-compatible.
    const rota: Record<string, Record<string, string>> = {}
    for (const r of (rotaRows ?? []) as { forma_id: string; loja_id: string; conta_id: string }[]) {
      (rota[r.forma_id] ??= {})[r.loja_id] = r.conta_id
    }
    const temRota = Object.keys(rota).length > 0

    // venda → loja (via depósito): precisa pra rotear DINHEIRO (caixa da loja) e,
    // agora, cartão/PIX por loja quando houver rota configurada. Também traz o
    // status da venda — cancelar_venda desfaz estoque/fiado/crédito mas NUNCA
    // apaga as linhas de pagamentos_venda (fica o registro de que a maquininha
    // foi passada), então sem filtrar por status uma venda cancelada continuava
    // somando pra sempre no saldo da conta, mesmo com o dinheiro nunca tendo
    // ficado com a loja.
    const lojaDaVenda: Record<string, string | null> = {}
    const statusDaVenda: Record<string, string | null> = {}
    const temDinheiro = (pv ?? []).some((p) => { const f = p.forma_pagamento_id ? formaById[p.forma_pagamento_id] : null; return f?.tipo === 'dinheiro' })
    const vendaIds = [...new Set((pv ?? []).map((p) => p.venda_id).filter(Boolean))] as string[]
    if (vendaIds.length) {
      const depDaVenda: Record<string, string | null> = {}
      for (let i = 0; i < vendaIds.length; i += 300) {
        const { data } = await supabase.from('vendas').select('id, deposito_id, status').in('id', vendaIds.slice(i, i + 300))
        for (const v of data ?? []) {
          depDaVenda[v.id] = (v as { deposito_id: string | null }).deposito_id
          statusDaVenda[v.id] = (v as { status: string | null }).status
        }
      }
      if ((temDinheiro && Object.keys(caixaDaLoja).length) || temRota) {
        const depIds = [...new Set(Object.values(depDaVenda).filter(Boolean))] as string[]
        const lojaDoDep: Record<string, string | null> = {}
        if (depIds.length) {
          const { data } = await supabase.from('depositos').select('id, loja_id').in('id', depIds)
          for (const d of data ?? []) lojaDoDep[d.id] = (d as { loja_id: string | null }).loja_id
        }
        for (const vid of vendaIds) { const dep = depDaVenda[vid]; lojaDaVenda[vid] = dep ? (lojaDoDep[dep] ?? null) : null }
      }
    }

    for (const p of (pv ?? [])) {
      if (p.venda_id && statusDaVenda[p.venda_id] === 'cancelada') continue
      const f = p.forma_pagamento_id ? formaById[p.forma_pagamento_id] : null
      if (!f) continue
      let conta = f.conta_destino_id
      const loja = p.venda_id ? lojaDaVenda[p.venda_id] : null
      if (f.tipo === 'dinheiro') {
        if (loja && caixaDaLoja[loja]) conta = caixaDaLoja[loja]   // dinheiro → caixa da loja
      } else if (loja && p.forma_pagamento_id && rota[p.forma_pagamento_id]?.[loja]) {
        conta = rota[p.forma_pagamento_id][loja]                    // cartão/PIX → conta da loja (Isa)
      }
      // pagamentos_venda.valor JÁ é o valor líquido do produto — a taxa é
      // cobrada A MAIS do cliente (confirmado com o dono: quem paga R$100 no
      // cartão é passado R$105 se a taxa for 5%), não descontada da loja. A
      // trava do finalizar_venda também confirma isso: soma(valor) precisa
      // bater com o total dos PRODUTOS, sem taxa. Subtrair taxa aqui cobrava
      // a taxa 2x: uma do cliente (na maquininha) e outra da própria loja
      // (no saldo da conta).
      if (conta && conta in saldo) saldo[conta] += (p.valor ?? 0)
    }
    for (const t of (tr ?? [])) {
      if (t.conta_destino_id in saldo) saldo[t.conta_destino_id] += t.valor ?? 0
      if (t.conta_origem_id in saldo) saldo[t.conta_origem_id] -= t.valor ?? 0
    }
    for (const l of (lc ?? [])) {
      if (!(l.conta_id in saldo)) continue
      saldo[l.conta_id] += l.tipo === 'receber' ? (l.valor ?? 0) : -(l.valor ?? 0)
    }
  } catch { /* colunas novas ainda não existem — mostra só o inicial */ }
  return saldo
}
