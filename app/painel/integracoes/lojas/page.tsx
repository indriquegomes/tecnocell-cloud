import { redirect } from 'next/navigation'
import { listarConexoes } from '@/lib/mercado-livre'

export default async function IntegracoesLojasPage() {
  const conexoes = await listarConexoes()
  if (conexoes.length > 0) redirect(`/painel/integracoes/lojas/mercado-livre/${conexoes[0].id}`)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
      <p className="text-sm text-gray-500">Nenhuma loja conectada ainda.</p>
      <p className="mt-1 text-xs text-gray-400">Clique em &quot;+ Adicionar Loja&quot; pra conectar sua primeira conta.</p>
    </div>
  )
}
