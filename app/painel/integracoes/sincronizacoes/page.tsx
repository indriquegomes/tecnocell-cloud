import { IconSwap } from '@/components/icons'
import { Dica } from '@/components/Dica'

export default function IntegracoesSincronizacoesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconSwap className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Sincronizações Pendentes</h2>
        <Dica texto="Fila de produtos aguardando sincronizar com as lojas virtuais conectadas." />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Nenhuma sincronização pendente.</p>
      </div>
    </div>
  )
}
