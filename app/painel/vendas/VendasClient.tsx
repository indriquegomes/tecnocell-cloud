'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { buscarDetalheVendaPublic } from './actions'

type Venda = {
  id: string
  total: number
  desconto: number
  created_at: string
  status: string
  vendedor_nome: string | null
  pessoa_nome: string | null
  deposito: { id: string; nome: string } | null
  forma_pagamento: { id: string; nome: string } | null
}

type DetalheVenda = {
  id: string
  total: number
  desconto: number
  created_at: string
  vendedor_nome: string | null
  deposito_nome: string | null
  forma_pagamento_nome: string | null
  pessoa_nome: string | null
  itens: { nome: string; quantidade: number; preco_unitario: number; total_item: number }[]
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function VendasClient({
  vendas,
  totalGeral,
  totalDesconto,
  ticketMedio,
  depositos,
  formas,
  filtros,
}: {
  vendas: Venda[]
  totalGeral: number
  totalDesconto: number
  ticketMedio: number
  depositos: { id: string; nome: string }[]
  formas: { id: string; nome: string }[]
  filtros: { de: string; ate: string; busca: string; deposito: string; forma: string }
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [de, setDe] = useState(filtros.de)
  const [ate, setAte] = useState(filtros.ate)
  const [busca, setBusca] = useState(filtros.busca)
  const [deposito, setDeposito] = useState(filtros.deposito)
  const [forma, setForma] = useState(filtros.forma)

  const [detalhe, setDetalhe] = useState<DetalheVenda | null>(null)
  const [carregando, setCarregando] = useState(false)

  const aplicarFiltros = useCallback(() => {
    const p = new URLSearchParams()
    if (de) p.set('de', de)
    if (ate) p.set('ate', ate)
    if (busca) p.set('busca', busca)
    if (deposito) p.set('deposito', deposito)
    if (forma) p.set('forma', forma)
    startTransition(() => router.push(`/painel/vendas?${p.toString()}`))
  }, [de, ate, busca, deposito, forma, router])

  const abrirDetalhe = async (id: string) => {
    setCarregando(true)
    setDetalhe(null)
    try {
      const d = await buscarDetalheVendaPublic(id)
      setDetalhe(d)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-gray-900">Painel de Vendas</h2>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: `${vendas.length} venda${vendas.length !== 1 ? 's' : ''} no período`, valor: fmt(totalGeral), cor: 'text-green-600' },
          { label: 'Ticket médio', valor: fmt(ticketMedio), cor: 'text-blue-600' },
          { label: 'Total em descontos', valor: fmt(totalDesconto), cor: 'text-orange-500' },
          { label: 'Valor líquido', valor: fmt(totalGeral - totalDesconto), cor: 'text-gray-900' },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">De</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Até</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-xs font-semibold text-gray-500 uppercase">Cliente / Vendedor</label>
            <input type="text" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarFiltros()}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Loja</label>
            <select value={deposito} onChange={(e) => setDeposito(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas</option>
              {depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase">Pagamento</label>
            <select value={forma} onChange={(e) => setForma(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas</option>
              {formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <button onClick={aplicarFiltros}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Filtrar
          </button>
          <button onClick={() => {
            setDe(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
            setAte(new Date().toISOString().split('T')[0])
            setBusca(''); setDeposito(''); setForma('')
            startTransition(() => router.push('/painel/vendas'))
          }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition">
            Limpar
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Data / Hora</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Loja</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3 text-right">Desconto</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-2 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {vendas.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-gray-400">Nenhuma venda no período.</td></tr>
            ) : vendas.map((v) => (
              <tr key={v.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtData(v.created_at)}</td>
                <td className="px-4 py-3 text-gray-800">{v.pessoa_nome ?? <span className="text-gray-400 italic">—</span>}</td>
                <td className="px-4 py-3 text-gray-600">{v.vendedor_nome ?? <span className="text-gray-400 italic">—</span>}</td>
                <td className="px-4 py-3 text-gray-600">{v.deposito?.nome ?? <span className="text-gray-400 italic">—</span>}</td>
                <td className="px-4 py-3 text-gray-600">{v.forma_pagamento?.nome ?? <span className="text-gray-400 italic">—</span>}</td>
                <td className="px-4 py-3 text-right text-orange-500">{v.desconto > 0 ? `-${fmt(v.desconto)}` : '—'}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(v.total)}</td>
                <td className="px-2 py-3">
                  <button onClick={() => abrirDetalhe(v.id)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition">
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal detalhe */}
      {(detalhe || carregando) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetalhe(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Detalhe da Venda</h3>
              <button onClick={() => setDetalhe(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {carregando && !detalhe ? (
              <p className="py-14 text-center text-sm text-gray-400">Carregando...</p>
            ) : detalhe ? (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* Infos gerais */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Data', valor: fmtData(detalhe.created_at) },
                    { label: 'Vendedor', valor: detalhe.vendedor_nome ?? '—' },
                    { label: 'Cliente', valor: detalhe.pessoa_nome ?? 'Cliente Final' },
                    { label: 'Loja', valor: detalhe.deposito_nome ?? '—' },
                    { label: 'Pagamento', valor: detalhe.forma_pagamento_nome ?? '—' },
                  ].map(({ label, valor }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
                      <p className="text-gray-800">{valor}</p>
                    </div>
                  ))}
                </div>

                {/* Itens */}
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-xs font-semibold uppercase text-gray-400">
                        <th className="px-3 py-2 text-left">Produto</th>
                        <th className="px-3 py-2 text-right">Qtd</th>
                        <th className="px-3 py-2 text-right">Unit.</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detalhe.itens.map((i, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-gray-800">{i.nome}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{i.quantidade}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{fmt(i.preco_unitario)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(i.total_item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totais */}
                <div className="flex flex-col items-end gap-1 text-sm">
                  {detalhe.desconto > 0 && (
                    <div className="flex gap-6">
                      <span className="text-gray-400">Desconto</span>
                      <span className="text-orange-500 font-medium">-{fmt(detalhe.desconto)}</span>
                    </div>
                  )}
                  <div className="flex gap-6">
                    <span className="font-bold text-gray-700">Total</span>
                    <span className="font-bold text-gray-900 text-base">{fmt(detalhe.total)}</span>
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
