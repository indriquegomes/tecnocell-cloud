import { createServiceClient, requireAuth } from '@/lib/supabase/server'

type StatusOS = 'aberta' | 'em_andamento' | 'aguardando_peca' | 'pronta' | 'entregue' | 'cancelada'

async function buscarOS() {
  await requireAuth()
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('ordens_servico')
    .select(`
      id, numero, pessoa_nome, equipamento, marca, modelo,
      defeito_relatado, status, total, tecnico_nome, created_at,
      itens:itens_os(id)
    `)
    .order('created_at', { ascending: false })
    .limit(100)
  return data ?? []
}

function fmt(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

const STATUS_MAP: Record<StatusOS, { label: string; cls: string }> = {
  aberta:           { label: 'Aberta',            cls: 'bg-yellow-100 text-yellow-800' },
  em_andamento:     { label: 'Em andamento',       cls: 'bg-blue-100 text-blue-700' },
  aguardando_peca:  { label: 'Aguard. peça',       cls: 'bg-orange-100 text-orange-700' },
  pronta:           { label: 'Pronta',             cls: 'bg-green-100 text-green-700' },
  entregue:         { label: 'Entregue',           cls: 'bg-gray-100 text-gray-600' },
  cancelada:        { label: 'Cancelada',          cls: 'bg-red-100 text-red-600' },
}

function BadgeOS({ status }: { status: string }) {
  const s = STATUS_MAP[status as StatusOS] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}

export default async function OSPage() {
  const ordens = await buscarOS().catch(() => [])

  const abertas       = ordens.filter(o => o.status === 'aberta').length
  const emAndamento   = ordens.filter(o => ['em_andamento', 'aguardando_peca'].includes(o.status)).length
  const prontas       = ordens.filter(o => o.status === 'pronta').length
  const ativas        = ordens.filter(o => !['entregue', 'cancelada'].includes(o.status))
  const historico     = ordens.filter(o => ['entregue', 'cancelada'].includes(o.status))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Ordens de Serviço</h2>
          <p className="text-sm text-gray-500 mt-0.5">Controle de reparos — abertura, andamento e encerramento</p>
        </div>
        <button
          disabled
          title="Em breve"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-40 cursor-not-allowed"
        >
          + Nova OS
        </button>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Abertas',       valor: abertas,     cor: 'text-yellow-600' },
          { label: 'Em andamento',  valor: emAndamento, cor: 'text-blue-600' },
          { label: 'Prontas',       valor: prontas,     cor: 'text-green-600' },
          { label: 'Total ativas',  valor: ativas.length, cor: 'text-gray-800' },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* Tabela OS ativas */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">OS Ativas</h3>
          {ativas.length > 0 && (
            <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
              {ativas.length} em aberto
            </span>
          )}
        </div>

        {ativas.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🔧</p>
            <p className="text-sm text-gray-400">Nenhuma OS ativa.</p>
            <p className="text-xs text-gray-300 mt-1">
              {ordens.length === 0
                ? 'Execute a migration SQL e cadastre a primeira OS.'
                : 'Todas as ordens foram encerradas.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3 text-left font-medium">OS #</th>
                  <th className="px-6 py-3 text-left font-medium">Cliente</th>
                  <th className="px-6 py-3 text-left font-medium">Equipamento</th>
                  <th className="px-6 py-3 text-left font-medium">Defeito</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-left font-medium">Total</th>
                  <th className="px-6 py-3 text-left font-medium">Data</th>
                  <th className="px-6 py-3 text-left font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ativas.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">
                      #{String(o.numero).padStart(4, '0')}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {o.pessoa_nome ?? <span className="italic text-gray-400">Sem cliente</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      <p>{o.equipamento}</p>
                      {(o.marca || o.modelo) && (
                        <p className="text-xs text-gray-400">{[o.marca, o.modelo].filter(Boolean).join(' ')}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-[200px]">
                      <p className="truncate">{o.defeito_relatado}</p>
                    </td>
                    <td className="px-6 py-4">
                      <BadgeOS status={o.status} />
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {fmt(o.total ?? 0)}
                    </td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      {fmtData(o.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button disabled className="text-xs font-medium text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Em breve">
                          Ver
                        </button>
                        <span className="text-gray-200">|</span>
                        <button disabled className="text-xs font-medium text-green-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Em breve">
                          Editar
                        </button>
                        <span className="text-gray-200">|</span>
                        <button disabled className="text-xs font-medium text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Em breve">
                          Entregar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
                  <th className="px-6 py-3 text-left font-medium">OS #</th>
                  <th className="px-6 py-3 text-left font-medium">Cliente</th>
                  <th className="px-6 py-3 text-left font-medium">Equipamento</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-left font-medium">Total</th>
                  <th className="px-6 py-3 text-left font-medium">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historico.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/50 opacity-70">
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">#{String(o.numero).padStart(4, '0')}</td>
                    <td className="px-6 py-4 text-gray-700">{o.pessoa_nome ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-600">{o.equipamento} {o.modelo && `· ${o.modelo}`}</td>
                    <td className="px-6 py-4"><BadgeOS status={o.status} /></td>
                    <td className="px-6 py-4 text-gray-700">{fmt(o.total ?? 0)}</td>
                    <td className="px-6 py-4 text-gray-500">{fmtData(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Funcionalidades previstas */}
      <div className="rounded-xl border border-dashed border-gray-200 p-4">
        <p className="text-xs text-gray-400 font-medium mb-2">Funcionalidades previstas:</p>
        <div className="flex flex-wrap gap-2">
          {[
            'Nova OS (equipamento, defeito, cliente)',
            'Peças utilizadas (baixa de estoque)',
            'Mão de obra e serviços',
            'Troca de status e técnico',
            'Encerramento e cobrança',
            'Impressão de laudo / etiqueta',
            'Histórico por cliente',
          ].map(f => (
            <span key={f} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-400">{f}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
