import { carregarPedidosApp } from './actions'
import { PedidosAppClient } from './PedidosAppClient'

export default async function PedidosAppPage({ searchParams }: { searchParams: Promise<{ unidade?: string }> }) {
  const { unidade } = await searchParams
  try {
    const dados = await carregarPedidosApp(unidade)
    return <PedidosAppClient dados={dados} />
  } catch {
    return <div className="space-y-4"><h2 className="text-2xl font-bold text-gray-900">Pedidos do App</h2>
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar os pedidos. Confira sua sessão e a configuração da integração.</p>
      <a href="/painel/pedidos-app" className="text-sm text-blue-700 underline">Tentar novamente</a></div>
  }
}
