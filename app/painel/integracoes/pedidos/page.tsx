import { IconClipboard } from '@/components/icons'
import { Dica } from '@/components/Dica'

const COLUNAS = [
  'Código Ecommerce', 'Cliente', 'Data Criação', 'Status',
  'Status do Envio', 'Valor', 'Origem', 'Última Sincronização',
]

export default function IntegracoesPedidosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconClipboard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Meus Pedidos</h2>
        <Dica texto="Pedidos importados das lojas/marketplaces conectados. Vazio até a primeira integração ser conectada de verdade." />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {COLUNAS.map((c) => (
                <th key={c} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={COLUNAS.length} className="px-4 py-10 text-center text-sm text-gray-400">
                Nenhum pedido — conecte uma loja pra importar pedidos.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
