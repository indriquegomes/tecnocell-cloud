import { IconFile } from '@/components/icons'
import { Dica } from '@/components/Dica'

export default function IntegracoesMensagensPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconFile className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mensagens Automáticas</h2>
        <Dica texto="Manda mensagem automática pro cliente quando um evento acontecer (ex: pedido despachado). Depende de uma loja conectada primeiro." />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Conecte uma loja em &quot;Minhas Lojas&quot; pra configurar mensagens automáticas.</p>
      </div>
    </div>
  )
}
