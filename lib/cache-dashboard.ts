import { unstable_cache } from 'next/cache'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'

export type VendaCash = { lojaId: string | null; dia: string; cash: number }

// Faturamento das metas por (loja, dia) — a parte PESADA do dashboard. Puxa todas
// as vendas do período + pagamentos + o histórico do SIGE (imutável, o fetchAll
// mais caro) e soma o "cash" (exclui fiado). Era o que fazia o dashboard levar ~3s.
//
// Agora fica em cache por 2 min (revalidate) — uma meta acumulada do mês não muda
// ao segundo, então 2 min de atraso é irrelevante. stale-while-revalidate: serve o
// valor pronto na hora e atualiza em segundo plano. Invalida na hora se mexer em
// metas/vendas (tag). Mesmíssimo cálculo de antes, só que guardado.
export async function getFaturamentoMetas(de: string, ate: string): Promise<VendaCash[]> {
  return unstable_cache(
    async () => {
      const sb = await createServiceClient()

      // lojas pro match do histórico ("TECNOCELL PETRÓPOLIS" → "PETRÓPOLIS" → id)
      const { data: lojas } = await sb.from('lojas').select('id, nome')
      const nomeParaLojaId: Record<string, string> = {}
      for (const l of lojas ?? []) nomeParaLojaId[(l.nome ?? '').trim().toUpperCase()] = l.id

      // vendas do período + histórico SIGE + lookups: uma onda paralela
      const [vendasPeriodo, histMeta, { data: formasFiado }, { data: caixasL }, { data: depsL }] = await Promise.all([
        fetchAll<{ id: string; caixa_id: string | null; deposito_id: string | null; created_at: string }>(
          (from, to) => sb.from('vendas').select('id, caixa_id, deposito_id, created_at').eq('status', 'concluida').gte('created_at', de).lte('created_at', ate + 'T23:59:59').range(from, to)),
        fetchAll<{ loja: string | null; valor_final: number | null; data: string }>(
          (from, to) => sb.from('historico_vendas').select('loja, valor_final, data').eq('status', 'Pedido Faturado').gte('data', de).lte('data', ate + 'T23:59:59').range(from, to)),
        sb.from('formas_pagamento').select('id').eq('tipo', 'fiado'),
        sb.from('caixas').select('id, loja_id'),
        sb.from('depositos').select('id, loja_id'),
      ])
      const vendaIds = vendasPeriodo.map((v) => v.id)
      const pagsV = vendaIds.length ? await fetchAll<{ venda_id: string; valor: number; forma_pagamento_id: string }>(
        (from, to) => sb.from('pagamentos_venda').select('venda_id, valor, forma_pagamento_id').in('venda_id', vendaIds).range(from, to)) : []

      const fiadoIds = new Set((formasFiado ?? []).map((f) => f.id))
      const caixaLoja: Record<string, string | null> = Object.fromEntries((caixasL ?? []).map((c) => [c.id, c.loja_id]))
      const depLoja: Record<string, string | null> = Object.fromEntries((depsL ?? []).map((d) => [d.id, d.loja_id]))
      const cashPorVenda: Record<string, number> = {}
      for (const p of pagsV) if (!fiadoIds.has(p.forma_pagamento_id)) cashPorVenda[p.venda_id] = (cashPorVenda[p.venda_id] ?? 0) + Number(p.valor)

      const vendasCash: VendaCash[] = vendasPeriodo.map((v) => ({
        lojaId: caixaLoja[v.caixa_id ?? ''] ?? depLoja[v.deposito_id ?? ''] ?? null,
        dia: (v.created_at ?? '').slice(0, 10),
        cash: cashPorVenda[v.id] ?? 0,
      }))
      // histórico do SIGE entra na meta (conta cheio — não tem forma de pagamento)
      for (const h of histMeta) {
        const chave = (h.loja ?? '').replace(/^TECNOCELL\s+/i, '').trim().toUpperCase()
        const lojaId = nomeParaLojaId[chave] ?? null
        if (!lojaId) continue
        vendasCash.push({ lojaId, dia: (h.data ?? '').slice(0, 10), cash: Number(h.valor_final) || 0 })
      }
      return vendasCash
    },
    ['fatur-metas', de, ate],
    { tags: ['metas', 'dashboard'], revalidate: 120 },
  )()
}
