'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

type VendedorRow = {
  nome: string
  qtd: number
  total: number
  desconto: number
}

type VendaRow = {
  id: string
  total: number
  desconto: number
  vendedor_nome: string | null
  created_at: string
  forma_pagamento_id: string | null
}

export function PainelVendedorClient({
  ranking,
  totalGeral,
  totalVendas,
  filtros,
  vendasVendedor,
}: {
  ranking: VendedorRow[]
  totalGeral: number
  totalVendas: number
  filtros: { de: string; ate: string; vendedor: string }
  vendasVendedor: VendaRow[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [de, setDe] = useState(filtros.de)
  const [ate, setAte] = useState(filtros.ate)
  const [vendedorSelecionado, setVendedorSelecionado] = useState(filtros.vendedor)

  const melhor = ranking[0]
  const ticketMedioGeral = totalVendas > 0 ? totalGeral / totalVendas : 0

  const aplicar = (novoVendedor?: string) => {
    const p = new URLSearchParams()
    p.set('de', de)
    p.set('ate', ate)
    if (novoVendedor !== undefined ? novoVendedor : vendedorSelecionado) {
      p.set('vendedor', novoVendedor !== undefined ? novoVendedor : vendedorSelecionado)
    }
    startTransition(() => router.push(`/painel/painel-vendedor?${p.toString()}`))
  }

  const abrirVendedor = (nome: string) => {
    const novo = vendedorSelecionado === nome ? '' : nome
    setVendedorSelecionado(novo)
    aplicar(novo)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Painel Vendedor</h2>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase text-gray-500">De</label>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase text-gray-500">Até</label>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => aplicar()}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          Filtrar
        </button>
        <button onClick={() => {
          const ini = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
          const hj = new Date().toISOString().split('T')[0]
          setDe(ini); setAte(hj); setVendedorSelecionado('')
          startTransition(() => router.push('/painel/painel-vendedor'))
        }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition">
          Limpar
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total no período',   valor: fmt(totalGeral),        cor: 'text-green-600' },
          { label: 'Vendas realizadas',  valor: String(totalVendas),    cor: 'text-blue-600' },
          { label: 'Ticket médio',       valor: fmt(ticketMedioGeral),  cor: 'text-purple-600' },
          { label: 'Melhor vendedor',    valor: melhor?.nome ?? '—',    cor: 'text-orange-500' },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`mt-1 text-xl font-bold truncate ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* Ranking */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="font-semibold text-gray-800">Ranking de Vendedores</h3>
          <p className="text-xs text-gray-400 mt-0.5">Clique em um vendedor para ver as vendas dele</p>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-5 py-3 w-8">#</th>
              <th className="px-5 py-3">Vendedor</th>
              <th className="px-5 py-3 text-right">Qtd Vendas</th>
              <th className="px-5 py-3 text-right">Descontos</th>
              <th className="px-5 py-3 text-right">Ticket Médio</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3 text-right">% do período</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ranking.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">Nenhuma venda no período.</td></tr>
            )}
            {ranking.map((v, idx) => {
              const ticket = v.qtd > 0 ? v.total / v.qtd : 0
              const pct = totalGeral > 0 ? (v.total / totalGeral) * 100 : 0
              const ativo = vendedorSelecionado === v.nome
              return (
                <tr key={v.nome}
                  onClick={() => abrirVendedor(v.nome)}
                  className={`cursor-pointer transition ${ativo ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-5 py-3">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold
                      ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-gray-100 text-gray-600' : idx === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        {v.nome[0]?.toUpperCase()}
                      </div>
                      <span className={`font-medium ${ativo ? 'text-blue-700' : 'text-gray-800'}`}>{v.nome}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">{v.qtd}</td>
                  <td className="px-5 py-3 text-right text-orange-500">
                    {v.desconto > 0 ? `-${fmt(v.desconto)}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">{fmt(ticket)}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">{fmt(v.total)}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Drill-down: vendas do vendedor selecionado */}
      {vendedorSelecionado && vendasVendedor.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
          <div className="border-b border-blue-100 bg-blue-50 px-5 py-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-800">Vendas de {vendedorSelecionado}</h3>
              <p className="text-xs text-blue-500 mt-0.5">{vendasVendedor.length} venda{vendasVendedor.length !== 1 ? 's' : ''} no período</p>
            </div>
            <button onClick={() => abrirVendedor(vendedorSelecionado)}
              className="text-xs text-blue-500 hover:text-blue-700">fechar ×</button>
          </div>
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3 text-right">Desconto</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vendasVendedor.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 text-gray-600">{fmtData(v.created_at)}</td>
                  <td className="px-5 py-2.5 text-right text-orange-500">
                    {(v.desconto ?? 0) > 0 ? `-${fmt(v.desconto ?? 0)}` : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right font-semibold text-gray-900">{fmt(v.total ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
