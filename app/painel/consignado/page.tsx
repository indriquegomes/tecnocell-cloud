import { createServiceClient, requireAuth } from '@/lib/supabase/server'

async function buscarConsignados() {
  await requireAuth()
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('consignados')
    .select(`
      id, pessoa_nome, observacoes, status, total, created_at,
      itens:itens_consignado(id, nome, quantidade, devolvido)
    `)
    .order('created_at', { ascending: false })
    .limit(50)
  return data ?? []
}

function fmt(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BadgeStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    aberto: 'bg-yellow-100 text-yellow-800',
    devolvido: 'bg-green-100 text-green-700',
    acertado: 'bg-blue-100 text-blue-700',
    parcial: 'bg-orange-100 text-orange-700',
  }
  const labels: Record<string, string> = {
    aberto: 'Aberto',
    devolvido: 'Devolvido',
    acertado: 'Acertado',
    parcial: 'Parcial',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}

export default async function ConsignadoPage() {
  const consignados = await buscarConsignados()

  const abertos = consignados.filter(c => c.status === 'aberto')
  const historico = consignados.filter(c => c.status !== 'aberto')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Consignado</h2>
          <p className="text-sm text-gray-500 mt-0.5">Mercadorias em consignação — saída, devolução e acerto</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
            Nova saída via F12 no PDV
          </span>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Em Aberto</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{abertos.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmt(abertos.reduce((s, c) => s + (c.total ?? 0), 0))} em circulação
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Acertados / Devolvidos</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{historico.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmt(historico.reduce((s, c) => s + (c.total ?? 0), 0))} encerrados
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total geral</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{consignados.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">saídas registradas</p>
        </div>
      </div>

      {/* Tabela saídas abertas */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Saídas Abertas</h3>
          {abertos.length > 0 && (
            <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2.5 py-0.5">
              {abertos.length} pendente{abertos.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {abertos.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">Nenhuma saída em aberto.</p>
            <p className="text-xs text-gray-300 mt-1">Use F12 no PDV para registrar uma saída consignada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">Data</th>
                  <th className="px-6 py-3 text-left font-medium">Cliente</th>
                  <th className="px-6 py-3 text-left font-medium">Itens</th>
                  <th className="px-6 py-3 text-left font-medium">Total</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-left font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {abertos.map((c) => {
                  const itens = c.itens ?? []
                  const totalItens = itens.length
                  const devolvidos = itens.filter((i: { devolvido: number; quantidade: number }) => i.devolvido >= i.quantidade).length
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                        {fmtData(c.created_at)}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {c.pessoa_nome ?? <span className="text-gray-400 italic">Sem cliente</span>}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {totalItens} {totalItens === 1 ? 'item' : 'itens'}
                        {devolvidos > 0 && (
                          <span className="ml-1.5 text-xs text-green-600">({devolvidos} devolvido{devolvidos > 1 ? 's' : ''})</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        {fmt(c.total ?? 0)}
                      </td>
                      <td className="px-6 py-4">
                        <BadgeStatus status={c.status} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {/* Ações futuras — esqueleto */}
                          <button
                            disabled
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Em breve"
                          >
                            Ver itens
                          </button>
                          <span className="text-gray-200">|</span>
                          <button
                            disabled
                            className="text-xs font-medium text-green-600 hover:text-green-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Em breve"
                          >
                            Devolução
                          </button>
                          <span className="text-gray-200">|</span>
                          <button
                            disabled
                            className="text-xs font-medium text-purple-600 hover:text-purple-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Em breve"
                          >
                            Acerto
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h3 className="text-sm font-semibold text-gray-900">Histórico</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">Data</th>
                  <th className="px-6 py-3 text-left font-medium">Cliente</th>
                  <th className="px-6 py-3 text-left font-medium">Itens</th>
                  <th className="px-6 py-3 text-left font-medium">Total</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historico.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors opacity-70">
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{fmtData(c.created_at)}</td>
                    <td className="px-6 py-4 text-gray-700">{c.pessoa_nome ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-500">{(c.itens ?? []).length} itens</td>
                    <td className="px-6 py-4 text-gray-700">{fmt(c.total ?? 0)}</td>
                    <td className="px-6 py-4"><BadgeStatus status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Avisos de features futuras */}
      <div className="rounded-xl border border-dashed border-gray-200 p-4">
        <p className="text-xs text-gray-400 font-medium mb-2">Funcionalidades previstas para esta tela:</p>
        <div className="flex flex-wrap gap-2">
          {['Ver itens detalhados', 'Registrar devolução parcial ou total', 'Acerto financeiro (converter em venda)', 'Filtro por cliente / período', 'Exportar relatório'].map(f => (
            <span key={f} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-400">{f}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
