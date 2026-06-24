'use client'

import { useState, useActionState } from 'react'
import { registrarDevolucao, registrarAcerto, type ActionState } from './actions'

type ItemConsignado = {
  id: string
  nome: string
  quantidade: number
  devolvido: number
  preco_unitario: number
}

type Consignado = {
  id: string
  pessoa_nome: string | null
  observacoes: string | null
  status: string
  total: number
  created_at: string
  itens: ItemConsignado[]
}

function fmt(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  devolvido: 'Devolvido',
  acertado: 'Acertado',
  parcial: 'Parcial',
}
const STATUS_CLS: Record<string, string> = {
  aberto: 'bg-yellow-100 text-yellow-800',
  devolvido: 'bg-green-100 text-green-700',
  acertado: 'bg-blue-100 text-blue-700',
  parcial: 'bg-orange-100 text-orange-700',
}

function BadgeStatus({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function FeedbackMsg({ state }: { state: ActionState }) {
  if (!state) return null
  return (
    <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${state.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {state.message}
    </div>
  )
}

function PainelDevolucao({ consignado, onFechar }: { consignado: Consignado; onFechar: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registrarDevolucao, null)
  const pendentes = consignado.itens.filter((i) => (i.devolvido ?? 0) < i.quantidade)

  if (state?.ok) {
    return (
      <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm text-green-700 font-medium">{state.message}</p>
        <button onClick={onFechar} className="mt-2 text-xs text-green-600 underline">Fechar</button>
      </div>
    )
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <input type="hidden" name="consignado_id" value={consignado.id} />
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Registrar Devolução</p>
      {pendentes.length === 0 ? (
        <p className="text-sm text-gray-400">Todos os itens já foram devolvidos.</p>
      ) : (
        <div className="space-y-2">
          {pendentes.map((item) => {
            const pendente = item.quantidade - (item.devolvido ?? 0)
            return (
              <div key={item.id} className="flex items-center gap-3">
                <div className="flex-1 text-sm">
                  <span className="font-medium text-gray-700">{item.nome}</span>
                  <span className="text-gray-400 ml-2 text-xs">{pendente} pendente{pendente > 1 ? 's' : ''}</span>
                </div>
                <input
                  name={`devolvido_${item.id}`}
                  type="number"
                  min="0"
                  max={pendente}
                  defaultValue={pendente}
                  className="field w-20 text-center"
                />
              </div>
            )
          })}
        </div>
      )}
      <FeedbackMsg state={state} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onFechar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
          Cancelar
        </button>
        {pendentes.length > 0 && (
          <button type="submit" disabled={pending} className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition disabled:opacity-50">
            {pending ? 'Salvando...' : 'Confirmar Devolução'}
          </button>
        )}
      </div>
    </form>
  )
}

function PainelAcerto({
  consignado,
  formas,
  onFechar,
}: {
  consignado: Consignado
  formas: { id: string; nome: string }[]
  onFechar: () => void
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registrarAcerto, null)
  const itensAcertar = consignado.itens.filter((i) => (i.devolvido ?? 0) < i.quantidade)
  const totalAcerto = itensAcertar.reduce(
    (s, i) => s + (i.quantidade - (i.devolvido ?? 0)) * (i.preco_unitario ?? 0),
    0,
  )

  if (state?.ok) {
    return (
      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm text-blue-700 font-medium">{state.message}</p>
        <button onClick={onFechar} className="mt-2 text-xs text-blue-600 underline">Fechar</button>
      </div>
    )
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <input type="hidden" name="consignado_id" value={consignado.id} />
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acerto Financeiro</p>

      {itensAcertar.length === 0 ? (
        <p className="text-sm text-gray-400">Todos os itens já foram devolvidos. Nada a acertar.</p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100 text-sm">
            {itensAcertar.map((item) => {
              const qty = item.quantidade - (item.devolvido ?? 0)
              return (
                <div key={item.id} className="flex justify-between px-3 py-2">
                  <span className="text-gray-600">{item.nome} <span className="text-gray-400">× {qty}</span></span>
                  <span className="font-semibold text-gray-800">{fmt(qty * (item.preco_unitario ?? 0))}</span>
                </div>
              )
            })}
            <div className="flex justify-between px-3 py-2 bg-blue-50 font-bold text-blue-800">
              <span>Total a cobrar</span>
              <span>{fmt(totalAcerto)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Forma de Pagamento</label>
              <select name="forma_pagamento_id" className="field text-sm" required>
                <option value="">Selecione...</option>
                {formas.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Observações</label>
              <input name="obs" className="field text-sm" placeholder="Opcional" />
            </div>
          </div>
        </>
      )}

      <FeedbackMsg state={state} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onFechar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
          Cancelar
        </button>
        {itensAcertar.length > 0 && (
          <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50">
            {pending ? 'Salvando...' : 'Confirmar Acerto'}
          </button>
        )}
      </div>
    </form>
  )
}

function LinhaConsignado({ c, formas }: { c: Consignado; formas: { id: string; nome: string }[] }) {
  const [painel, setPainel] = useState<'itens' | 'devolucao' | 'acerto' | null>(null)
  const toggle = (p: typeof painel) => setPainel((prev) => (prev === p ? null : p))
  const fechar = () => setPainel(null)

  const totalItens = c.itens.length
  const devolvidos = c.itens.filter((i) => (i.devolvido ?? 0) >= i.quantidade).length
  const encerrado = c.status === 'devolvido' || c.status === 'acertado'

  return (
    <>
      <tr className="hover:bg-gray-50/50 transition-colors">
        <td className="px-6 py-4 text-gray-500 whitespace-nowrap text-sm">
          {new Date(c.created_at).toLocaleDateString('pt-BR')}
        </td>
        <td className="px-6 py-4 font-medium text-gray-900 text-sm">
          {c.pessoa_nome ?? <span className="text-gray-400 italic">Sem cliente</span>}
        </td>
        <td className="px-6 py-4 text-gray-600 text-sm">
          {totalItens} {totalItens === 1 ? 'item' : 'itens'}
          {devolvidos > 0 && <span className="ml-1.5 text-xs text-green-600">({devolvidos} devolvido{devolvidos > 1 ? 's' : ''})</span>}
        </td>
        <td className="px-6 py-4 font-semibold text-gray-900 text-sm">{fmt(c.total ?? 0)}</td>
        <td className="px-6 py-4"><BadgeStatus status={c.status} /></td>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2 text-xs font-medium">
            <button
              onClick={() => toggle('itens')}
              className={`transition ${painel === 'itens' ? 'text-gray-900 underline' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Ver itens
            </button>
            {!encerrado && (
              <>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => toggle('devolucao')}
                  className={`transition ${painel === 'devolucao' ? 'text-green-800 underline' : 'text-green-600 hover:text-green-800'}`}
                >
                  Devolução
                </button>
                <span className="text-gray-200">|</span>
                <button
                  onClick={() => toggle('acerto')}
                  className={`transition ${painel === 'acerto' ? 'text-purple-900 underline' : 'text-purple-600 hover:text-purple-900'}`}
                >
                  Acerto
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {painel !== null && (
        <tr>
          <td colSpan={6} className="px-6 pb-4">
            {painel === 'itens' && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100 text-sm overflow-hidden">
                {c.itens.map((item) => {
                  const pendente = item.quantidade - (item.devolvido ?? 0)
                  return (
                    <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <span className="font-medium text-gray-700">{item.nome}</span>
                        <span className="text-gray-400 ml-2 text-xs">
                          {item.quantidade} saíu · {item.devolvido ?? 0} devolvido · {pendente} pendente
                        </span>
                      </div>
                      <span className="font-semibold text-gray-700">{fmt((item.preco_unitario ?? 0) * item.quantidade)}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {painel === 'devolucao' && (
              <PainelDevolucao consignado={c} onFechar={fechar} />
            )}
            {painel === 'acerto' && (
              <PainelAcerto consignado={c} formas={formas} onFechar={fechar} />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function ConsignadoClient({
  abertos,
  historico,
  formas,
}: {
  abertos: Consignado[]
  historico: Consignado[]
  formas: { id: string; nome: string }[]
}) {
  return (
    <>
      {/* Saídas abertas */}
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
                {abertos.map((c) => <LinhaConsignado key={c.id} c={c} formas={formas} />)}
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
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 text-gray-700">{c.pessoa_nome ?? '—'}</td>
                    <td className="px-6 py-4 text-gray-500">{c.itens.length} itens</td>
                    <td className="px-6 py-4 text-gray-700">{fmt(c.total ?? 0)}</td>
                    <td className="px-6 py-4"><BadgeStatus status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
