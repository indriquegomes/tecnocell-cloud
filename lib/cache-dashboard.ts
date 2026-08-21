import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

export type VendaCash = { lojaId: string | null; dia: string; cash: number }

// Faturamento das metas por (loja, dia) — a parte PESADA do dashboard. O cálculo
// (vendas + pagamentos + histórico SIGE, somando o cash e excluindo fiado) foi pro
// BANCO num RPC agregado (dashboard_faturamento_metas): 1 viagem, poucas linhas, em
// vez de puxar tudo pro Node. Era o que fazia o dashboard levar ~3s em produção.
//
// Por cima, fica em cache por 2 min (revalidate) — uma meta acumulada do mês não muda
// ao segundo, então 2 min de atraso é irrelevante. stale-while-revalidate: serve o
// valor pronto na hora e atualiza em segundo plano. Invalida na hora se mexer em
// metas/vendas (tag). Mesmíssimo cálculo de antes, só que guardado.
export async function getFaturamentoMetas(de: string, ate: string): Promise<VendaCash[]> {
  return unstable_cache(
    async () => {
      // O banco SOMA e devolve já agregado por (loja, dia) — 1 viagem, poucas linhas
      // (migration dashboard_faturamento_metas). Antes puxava todas as vendas +
      // pagamentos + histórico pro Node e somava aqui: várias viagens, muitas linhas.
      const sb = await createServiceClient()
      const { data, error } = await sb.rpc('dashboard_faturamento_metas', { p_de: de, p_ate: ate })
      // Sem isso, uma falha do RPC vira silenciosamente "faturamento zero" no
      // dashboard de metas — indistinguível de um período sem venda nenhuma.
      if (error) console.error('dashboard_faturamento_metas falhou:', de, ate, error.message)
      return ((data ?? []) as { loja_id: string; dia: string; valor: number }[]).map((r) => ({
        lojaId: r.loja_id,
        dia: (r.dia ?? '').slice(0, 10),
        cash: Number(r.valor) || 0,
      }))
    },
    ['fatur-metas', de, ate],
    { tags: ['metas', 'dashboard'], revalidate: 120 },
  )()
}
