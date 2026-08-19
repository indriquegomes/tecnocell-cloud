import { IconIntegracao } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'
import { PLATAFORMAS } from '@/lib/integracoes'
import { conexaoAtual } from '@/lib/mercado-livre'
import { desconectarMercadoLivre } from './actions'

export default async function IntegracoesDashboardPage() {
  const conexaoML = await conexaoAtual()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconIntegracao className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Integrações</h2>
        <Dica texto="Central de e-commerce, marketplace, pagamento, logística e drop shipping. Nenhuma integração está conectada ainda — cada uma vira um projeto próprio quando tiver a credencial da plataforma." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {PLATAFORMAS.map((p) => {
          const isML = p.chave === 'mercado-livre'
          return (
            <div key={p.chave} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-800">{p.nome}</p>
                {isML && conexaoML ? (
                  <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Conectado
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Não conectado
                  </span>
                )}
              </div>
              {isML && conexaoML ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Conectado como <strong>{conexaoML.ml_nickname ?? conexaoML.ml_user_id}</strong></p>
                  <form action={desconectarMercadoLivre}>
                    <button type="submit" className="w-full rounded-xl border border-red-200 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition">
                      Desconectar
                    </button>
                  </form>
                </div>
              ) : isML ? (
                <a href="/api/integracoes/mercado-livre/autorizar"
                  className="block w-full rounded-xl border border-blue-200 py-2 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50 transition">
                  Conectar
                </a>
              ) : (
                <BotaoIndisponivel
                  label="Conectar"
                  className="w-full rounded-xl border border-blue-200 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
