import { buscarVendasML } from '@/lib/mercado-livre'
import { formatBRL, formatDate } from '@/lib/utils'

export default async function MinhasVendasMLPage({
  params,
}: {
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const { vendas, pendentes } = await buscarVendasML(conexaoId)

  return (
    <div className="space-y-6">
      {pendentes.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            {pendentes.length} pedido(s) precisam de revisão manual
          </p>
          <ul className="space-y-1 text-sm text-amber-700">
            {pendentes.map((p) => (
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
            {vendas.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma venda ainda.</td></tr>
            ) : vendas.map((v) => (
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
