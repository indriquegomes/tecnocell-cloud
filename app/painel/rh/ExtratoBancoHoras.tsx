'use client'

import { useState } from 'react'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import { excluirHora } from './actions'
import { formatDate } from '@/lib/utils'

const MOTIVO_LABEL: Record<string, string> = {
  solicitacao_loja: 'Solicitação da loja', cobrir_colega: 'Cobrir colega',
  atraso: 'Atraso', pagamento: 'Pagamento', folga: 'Folga', hora_extra: 'Hora extra', falta: 'Falta', dobra: 'Dobra (folga/feriado)', abono: 'Abonada (justificada)', outro: 'Outro',
}
const fmtH = (h: number) => {
  const m = Math.round(Math.abs(h) * 60)
  return `${h > 0 ? '+' : h < 0 ? '−' : ''}${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

type Item = { id: string; usuario_id: string; horas: number; data: string; motivo: string | null; obs: string | null; confirmado: boolean | null }

// Extrato do banco de horas — escondido por padrão, com filtro por pessoa.
export function ExtratoBancoHoras({ itens, nomes }: { itens: Item[]; nomes: Record<string, string> }) {
  const [aberto, setAberto] = useState(false)
  const [usuarioId, setUsuarioId] = useState('')

  const filtrados = usuarioId ? itens.filter((b) => b.usuario_id === usuarioId) : itens
  const nomesOrdenados = Object.entries(nomes).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-gray-50"
      >
        <h4 className="text-sm font-semibold text-gray-800">📊 Últimos lançamentos</h4>
        <span className="text-xs font-medium text-gray-400">{aberto ? 'Esconder extrato ▲' : 'Mostrar extrato ▼'}</span>
      </button>

      {aberto && (
        <>
          <div className="border-b border-gray-100 px-5 py-2.5">
            <label className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              Filtrar por pessoa:
              <select
                value={usuarioId}
                onChange={(e) => setUsuarioId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Todos</option>
                {nomesOrdenados.map(([id, nome]) => (
                  <option key={id} value={id}>{nome}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="divide-y divide-gray-50">
            {filtrados.slice(0, 50).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-800">{nomes[b.usuario_id] ?? '—'} <span className="text-gray-400">· {MOTIVO_LABEL[b.motivo ?? ''] ?? b.motivo ?? '—'}</span>{b.confirmado === false && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">pendente</span>}</p>
                  <p className="text-xs text-gray-400">{formatDate(b.data)}{b.obs ? ` · ${b.obs}` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-sm font-bold tabular-nums ${b.confirmado === false ? 'text-gray-400' : Number(b.horas) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtH(Number(b.horas))}</span>
                  <BotaoExcluir action={excluirHora.bind(null, b.id)} mensagem="Excluir este lançamento de hora?" />
                </div>
              </div>
            ))}
            {filtrados.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">Nenhum lançamento.</p>}
          </div>
        </>
      )}
    </div>
  )
}
