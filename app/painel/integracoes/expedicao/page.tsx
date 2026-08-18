import { IconSwap } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'

export default function IntegracoesExpedicaoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconSwap className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Expedição</h2>
          <Dica texto="Transportadoras e integrações de logística/entrega. Nenhuma conectada ainda." />
        </div>
        <BotaoIndisponivel label="+ Adicionar Expedição" />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Você ainda não configurou uma expedição.</p>
      </div>
    </div>
  )
}
