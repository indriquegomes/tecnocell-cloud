import { IconStore, IconPlus } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { listarConexoes } from '@/lib/mercado-livre'
import { ImportarAnunciosBotao } from './ImportarAnunciosBotao'
import { DesconectarBotao } from './DesconectarBotao'

// Um catálogo grande ainda pode levar mais que o padrão da Vercel mesmo
// buscando em lote — 60s é o máximo permitido no plano Hobby, então é o teto
// seguro que funciona em qualquer plano sem dar erro de configuração.
// (Precisa estar aqui, na page, não em actions.ts — Server Actions herdam o
// maxDuration da página que os chama, e um arquivo 'use server' só pode
// exportar funções async; um export const ali quebra o build inteiro.)
export const maxDuration = 60

export default async function IntegracoesLojasPage() {
  const conexoes = await listarConexoes()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Minhas Lojas</h2>
          <Dica texto="Contas Mercado Livre conectadas. Cada uma mostra anúncios, vendas, perguntas e catálogo próprios — pode conectar quantas contas precisar." />
        </div>
        <a href="/api/integracoes/mercado-livre/autorizar"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <IconPlus className="h-4 w-4" /> Conectar Mercado Livre
        </a>
      </div>

      {conexoes.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">Nenhuma conta conectada ainda.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {conexoes.map((c) => (
            <div key={c.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <a href={`/painel/integracoes/lojas/mercado-livre/${c.id}`}
                    className="font-semibold text-gray-800 hover:text-blue-600 hover:underline">
                    Mercado Livre
                  </a>
                  <p className="text-sm text-gray-500">Conectado como {c.ml_nickname ?? c.ml_user_id}</p>
                </div>
                <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Ativo</span>
              </div>
              <ImportarAnunciosBotao conexaoId={c.id} />
              <DesconectarBotao conexaoId={c.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
