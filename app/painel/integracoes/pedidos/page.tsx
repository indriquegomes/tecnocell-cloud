import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL, formatDate } from '@/lib/utils'
import { IconClipboard } from '@/components/icons'
import { Dica } from '@/components/Dica'

export default async function IntegracoesPedidosPage() {
  const supabase = await createServiceClient()
  const [{ data: vendas }, { data: pendentes }] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, created_at, ml_order_id')
      .not('ml_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('integracoes_mercado_livre_pedidos_pendentes')
      .select('id, ml_order_id, motivo, criado_em, resolvido')
      .eq('resolvido', false)
      .order('criado_em', { ascending: false }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconClipboard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Meus Pedidos</h2>
        <Dica texto="Pedidos importados das lojas/marketplaces conectados." />
      </div>

      {(pendentes ?? []).length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            {pendentes!.length} pedido(s) do Mercado Livre precisam de revisão manual
          </p>
          <ul className="space-y-1 text-sm text-amber-700">
            {pendentes!.map((p) => (
              <li key={p.id}>Pedido #{p.ml_order_id} — {p.motivo}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Código Ecommerce</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Venda</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(vendas ?? []).length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum pedido — conecte uma loja pra importar pedidos.</td></tr>
            ) : vendas!.map((v) => (
              <tr key={v.id} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{v.ml_order_id}</td>
                <td className="px-4 py-3 text-sm text-gray-600">#{v.numero}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(v.created_at)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{formatBRL(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
