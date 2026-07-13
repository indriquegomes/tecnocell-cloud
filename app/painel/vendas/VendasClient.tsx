'use client'

import { useState, useTransition, useCallback } from 'react'
import { hojeSP } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { buscarDetalheVendaPublic, type DetalheVendaCompleto } from './actions'
import { Dica } from '@/components/Dica'

type Venda = {
  id: string
  numero: number | null
  total: number
  desconto: number
  created_at: string
  status: string
  vendedor_nome: string | null
  pessoa_nome: string | null
  forma_pagamento_nome: string | null
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

const STATUS: Record<string, { label: string; cor: string }> = {
  concluida: { label: 'Concluída',   cor: 'bg-green-50 text-green-700 border-green-200' },
  cancelada:  { label: 'Cancelada',  cor: 'bg-red-50 text-red-600 border-red-200' },
  aberta:     { label: 'Em aberto',  cor: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
}

function BadgeStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cor: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cor}`}>
      {s.label}
    </span>
  )
}

export function VendasClient({
  vendas,
  totalGeral,
  totalDesconto,
  ticketMedio,
  canceladas,
  formas,
  filtros,
}: {
  vendas: Venda[]
  totalGeral: number
  totalDesconto: number
  ticketMedio: number
  canceladas: number
  formas: { id: string; nome: string }[]
  filtros: { de: string; ate: string; busca: string; forma: string; status: string }
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [de, setDe] = useState(filtros.de)
  const [ate, setAte] = useState(filtros.ate)
  const [busca, setBusca] = useState(filtros.busca)
  const [forma, setForma] = useState(filtros.forma)
  const [status, setStatus] = useState(filtros.status)

  const [detalhe, setDetalhe] = useState<DetalheVendaCompleto | null>(null)
  const [carregando, setCarregando] = useState(false)

  const aplicarFiltros = useCallback(() => {
    const p = new URLSearchParams()
    if (de) p.set('de', de)
    if (ate) p.set('ate', ate)
    if (busca) p.set('busca', busca)
    if (forma) p.set('forma', forma)
    if (status) p.set('status', status)
    startTransition(() => router.push(`/painel/vendas?${p.toString()}`))
  }, [de, ate, busca, forma, status, router])

  const abrirDetalhe = async (id: string) => {
    setCarregando(true)
    setDetalhe(null)
    const d = await buscarDetalheVendaPublic(id)
    setDetalhe(d)
    setCarregando(false)
  }

  const concluidas = vendas.filter(v => v.status === 'concluida').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-400 mb-0.5">Vendas</p>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Painel de Vendas</h2>
          <Dica texto="Lista de todas as vendas realizadas. Clique em uma venda para ver os detalhes, produtos e forma de pagamento." />
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total do período', valor: fmt(totalGeral), cor: 'text-green-600' },
          { label: `${concluidas} venda${concluidas !== 1 ? 's' : ''}`, valor: fmt(ticketMedio), sub: 'ticket médio', cor: 'text-blue-600' },
          { label: 'Descontos concedidos', valor: fmt(totalDesconto), cor: 'text-orange-500' },
          { label: canceladas > 0 ? `${canceladas} cancelada${canceladas !== 1 ? 's' : ''}` : 'Sem cancelamentos', valor: fmt(totalGeral - totalDesconto), sub: 'líquido', cor: 'text-gray-900' },
        ].map(({ label, valor, sub, cor }) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`text-xl font-bold mt-1 ${cor}`}>{valor}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">De</label>
            <input type="date" value={de} onChange={e => setDe(e.target.value)}
              className="field" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">Até</label>
            <input type="date" value={ate} onChange={e => setAte(e.target.value)}
              className="field" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-semibold text-gray-400 uppercase">Busca (cliente, vendedor, nº)</label>
            <input type="text" placeholder="Ex: João, Vitor, 42..." value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aplicarFiltros()}
              className="field" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">Pagamento</label>
            <select value={forma} onChange={e => setForma(e.target.value)} className="field">
              <option value="">Todas</option>
              {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-400 uppercase">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className="field">
              <option value="">Todos</option>
              <option value="concluida">Concluídas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
          <button onClick={aplicarFiltros}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 transition">
            Filtrar
          </button>
          <button onClick={() => {
            const ini = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
            const hj = hojeSP()
            setDe(ini); setAte(hj); setBusca(''); setForma(''); setStatus('')
            startTransition(() => router.push('/painel/vendas'))
          }} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition">
            Limpar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-50 text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-left">
                {['Nº', 'Data / Hora', 'Status', 'Cliente', 'Vendedor', 'Pagamento', 'Desconto', 'Total', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vendas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <p className="text-2xl mb-2">🛒</p>
                    <p className="text-sm text-gray-400">Nenhuma venda no período.</p>
                  </td>
                </tr>
              ) : vendas.map(v => (
                <tr key={v.id} className="hover:bg-blue-50/60/60 transition group cursor-pointer" onClick={() => abrirDetalhe(v.id)}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                      #{String(v.numero ?? '—').padStart(4, '0')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtData(v.created_at)}</td>
                  <td className="px-4 py-3"><BadgeStatus status={v.status} /></td>
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-[140px] truncate">
                    {v.pessoa_nome ?? <span className="text-gray-300 font-normal italic text-xs">Cliente final</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">
                    {v.vendedor_nome ?? <span className="text-gray-300 italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {v.forma_pagamento_nome ?? <span className="text-gray-300 italic text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-orange-500 whitespace-nowrap">
                    {v.desconto > 0 ? `-${fmt(v.desconto)}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{fmt(v.total)}</td>
                  <td className="px-3 py-3 opacity-0 group-hover:opacity-100 transition">
                    <span className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500">Ver</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {vendas.length > 0 && (
              <tfoot className="border-t border-gray-100 bg-gray-50/80">
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-xs text-gray-400">{vendas.length} registro{vendas.length !== 1 ? 's' : ''}</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-orange-500">
                    {totalDesconto > 0 ? `-${fmt(totalDesconto)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{fmt(totalGeral)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal detalhe */}
      {(detalhe || carregando) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { setDetalhe(null); setCarregando(false) }}>
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {detalhe ? `Venda #${String(detalhe.numero ?? '—').padStart(4, '0')}` : 'Carregando...'}
                </h3>
                {detalhe && <p className="text-xs text-gray-400 mt-0.5">{fmtData(detalhe.created_at)}</p>}
              </div>
              <div className="flex items-center gap-2">
                {detalhe && <BadgeStatus status={detalhe.status} />}
                <button onClick={() => { setDetalhe(null); setCarregando(false) }}
                  className="ml-2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">✕</button>
              </div>
            </div>

            {carregando && !detalhe ? (
              <p className="py-14 text-center text-sm text-gray-400">Carregando...</p>
            ) : detalhe ? (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Vendedor', valor: detalhe.vendedor_nome ?? '—' },
                    { label: 'Cliente', valor: detalhe.pessoa_nome ?? 'Cliente final' },
                  ].map(({ label, valor }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                      <p className="text-gray-800 mt-0.5">{valor}</p>
                    </div>
                  ))}
                </div>

                {detalhe.observacoes && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-gray-400 mb-1">Observações</p>
                    <p className="text-sm text-gray-600">{detalhe.observacoes}</p>
                  </div>
                )}

                {/* Itens */}
                <div>
                  <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Itens</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-xs font-semibold uppercase text-gray-400">
                          <th className="px-3 py-2 text-left">Produto</th>
                          <th className="px-3 py-2 text-right">Qtd</th>
                          <th className="px-3 py-2 text-right">Unit.</th>
                          <th className="px-3 py-2 text-right">Desc.</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {detalhe.itens.map((i, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-gray-800">{i.nome}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{i.quantidade}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{fmt(i.preco_unitario)}</td>
                            <td className="px-3 py-2 text-right text-orange-400">
                              {i.desconto_item > 0 ? `-${fmt(i.desconto_item)}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(i.total_item)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Pagamentos */}
                {detalhe.pagamentos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Pagamentos</p>
                    <div className="space-y-1.5">
                      {detalhe.pagamentos.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{p.forma_nome}</span>
                            {p.parcelas > 1 && (
                              <span className="ml-2 text-xs text-gray-400">{p.parcelas}x</span>
                            )}
                            {p.maquina && (
                              <span className="ml-2 text-xs text-gray-400">· {p.maquina}</span>
                            )}
                          </div>
                          <span className="text-sm font-bold text-gray-900">{fmt(p.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="border-t border-gray-100 pt-3 space-y-1">
                  {detalhe.desconto > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Desconto total</span>
                      <span className="text-orange-500 font-medium">-{fmt(detalhe.desconto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900">
                    <span>Total</span>
                    <span>{fmt(detalhe.total)}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
