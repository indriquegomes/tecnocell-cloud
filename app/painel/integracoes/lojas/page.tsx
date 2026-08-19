import { IconStore } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'
import { conexaoAtual } from '@/lib/mercado-livre'

export default async function IntegracoesLojasPage() {
  const conexaoML = await conexaoAtual()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Minhas Lojas</h2>
        <Dica texto="Lojas virtuais e marketplaces conectados. Cada loja conectada mostra anúncios, vendas, perguntas e catálogo — só depois de conectada de verdade." />
      </div>

      {conexaoML ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800">Mercado Livre</p>
              <p className="text-sm text-gray-500">Conectado como {conexaoML.ml_nickname ?? conexaoML.ml_user_id}</p>
            </div>
            <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Ativo</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">Nenhuma loja conectada ainda.</p>
          <div className="mt-4 flex justify-center">
            <BotaoIndisponivel label="+ Adicionar Loja" />
          </div>
        </div>
      )}
    </div>
  )
}
