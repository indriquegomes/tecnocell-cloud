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

    const [{ data: formas }, pv, tr, lc] = await Promise.all([
      supabase.from('formas_pagamento').select('id, tipo, conta_destino_id'),
      fetchAll<{ valor: number; taxa: number | null; forma_pagamento_id: string | null; venda_id: string | null }>((from, to) => supabase.from('pagamentos_venda').select('valor, taxa, forma_pagamento_id, venda_id').eq('status', 'pago').range(from, to)),
      fetchAll<{ conta_origem_id: string; conta_destino_id: string; valor: number }>((from, to) => supabase.from('transferencias').select('conta_origem_id, conta_destino_id, valor').range(from, to)),
      fetchAll<{ tipo: string; valor: number; conta_id: string }>((from, to) => supabase.from('lancamentos').select('tipo, valor, conta_id, status').eq('status', 'pago').not('conta_id', 'is', null).range(from, to)),
    ])
    const formaById = Object.fromEntries((formas ?? []).map((f) => [f.id, f as { tipo: string | null; conta_destino_id: string | null }]))

    // venda → loja (via depósito), só se houver caixa por loja + dinheiro a rotear
    const lojaDaVenda: Record<string, string | null> = {}
    const temDinheiro = (pv ?? []).some((p) => { const f = p.forma_pagamento_id ? formaById[p.forma_pagamento_id] : null; return f?.tipo === 'dinheiro' })
    if (temDinheiro && Object.keys(caixaDaLoja).length) {
      const vendaIds = [...new Set((pv ?? []).map((p) => p.venda_id).filter(Boolean))] as string[]
      const depDaVenda: Record<string, string | null> = {}
      for (let i = 0; i < vendaIds.length; i += 300) {
        const { data } = await supabase.from('vendas').select('id, deposito_id').in('id', vendaIds.slice(i, i + 300))
        for (const v of data ?? []) depDaVenda[v.id] = (v as { deposito_id: string | null }).deposito_id
      }
      const depIds = [...new Set(Object.values(depDaVenda).filter(Boolean))] as string[]
      const lojaDoDep: Record<string, string | null> = {}
      if (depIds.length) {
        const { data } = await supabase.from('depositos').select('id, loja_id').in('id', depIds)
        for (const d of data ?? []) lojaDoDep[d.id] = (d as { loja_id: string | null }).loja_id
      }
      for (const vid of vendaIds) { const dep = depDaVenda[vid]; lojaDaVenda[vid] = dep ? (lojaDoDep[dep] ?? null) : null }
    }

    for (const p of (pv ?? [])) {
      const f = p.forma_pagamento_id ? formaById[p.forma_pagamento_id] : null
      if (!f) continue
      let conta = f.conta_destino_id
      if (f.tipo === 'dinheiro' && p.venda_id) {
        const loja = lojaDaVenda[p.venda_id]
        if (loja && caixaDaLoja[loja]) conta = caixaDaLoja[loja]   // dinheiro → caixa da loja
      }
      if (conta && conta in saldo) saldo[conta] += (p.valor ?? 0) - (p.taxa ?? 0)
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
