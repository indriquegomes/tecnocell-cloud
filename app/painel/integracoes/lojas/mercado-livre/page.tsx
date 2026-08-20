import { formatBRL } from '@/lib/utils'
import {
  buscarVisaoGeral, buscarAnunciosSemEstoque, buscarFluxoVendas, buscarMaisVendidos,
  buscarAnunciosAguardandoAjuste,
} from '@/lib/mercado-livre-dashboard'

export default async function DashboardLojaMLPage() {
  const [visao, semEstoque, fluxo, maisVendidos, aguardandoAjuste] = await Promise.all([
    buscarVisaoGeral(),
    buscarAnunciosSemEstoque(),
    buscarFluxoVendas(),
    buscarMaisVendidos(),
    buscarAnunciosAguardandoAjuste(),
  ])

  const maxFaturamento = Math.max(1, ...fluxo.map((p) => p.faturamento))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Anúncios simples ativos', visao.anunciosSimplesAtivos],
          ['Anúncios de catálogo ativos', visao.anunciosCatalogoAtivos],
          ['Anúncios importados', visao.anunciosImportados],
          ['Perguntas não respondidas', visao.perguntasNaoRespondidas],
          ['Mensagens não lidas', visao.mensagensNaoLidas],
        ].map(([label, valor]) => (
          <div key={label as string} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{valor}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-3 font-semibold text-gray-800">Fluxo de Vendas (30 dias)</p>
          {fluxo.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma venda do Mercado Livre no período.</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {fluxo.map((p) => (
                <div key={p.dia} className="group relative flex-1">
                  <div
                    className="rounded-t bg-blue-500 transition-all group-hover:bg-blue-600"
                    style={{ height: `${Math.max(4, (p.faturamento / maxFaturamento) * 100)}%` }}
                  />
                  <div className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block">
                    {p.dia}: {formatBRL(p.faturamento)} ({p.quantidade})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-3 font-semibold text-gray-800">10 Anúncios Mais Vendidos</p>
          {maisVendidos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma venda do Mercado Livre ainda.</p>
          ) : (
            <ul className="space-y-2">
              {maisVendidos.map((a) => (
                <li key={a.mlItemId} className="flex items-center justify-between text-sm">
                  <span className="truncate text-gray-700">{a.titulo}</span>
                  <span className="shrink-0 font-semibold text-gray-900">{a.quantidadeVendida}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-3 font-semibold text-gray-800">Anúncios Sem Estoque</p>
        {semEstoque.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum anúncio sem estoque.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {semEstoque.map((a) => (
              <li key={a.mlItemId} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{a.titulo}</span>
                <span className="text-gray-400">{a.codigoProduto ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-3 font-semibold text-gray-800">Anúncios Aguardando Ajuste Solicitado pelo Mercado Livre</p>
        {aguardandoAjuste.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum anúncio com pendência.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {aguardandoAjuste.map((a) => (
              <li key={a.mlItemId} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{a.titulo}</span>
                <span className="text-xs font-medium text-amber-600">{a.subStatus}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
