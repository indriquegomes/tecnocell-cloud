'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
const fmtDia = (s: string) => {
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}

type VendedorRow = { nome: string; qtd: number; total: number; desconto: number; meta?: number }
type VendaRow = { id: string; total: number; desconto: number; vendedor_nome: string | null; created_at: string }
type DiaRow = { dia: string; total: number }

function GraficoDiario({ dados, mesAno }: { dados: DiaRow[]; mesAno: string }) {
  if (dados.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-300">
        Sem vendas no período
      </div>
    )
  }

  const W = 680
  const H = 160
  const PADX = 40
  const PADY = 20

  const max = Math.max(...dados.map(d => d.total), 1)
  const xStep = dados.length > 1 ? (W - PADX * 2) / (dados.length - 1) : W - PADX * 2

  const toX = (i: number) => PADX + i * xStep
  const toY = (v: number) => PADY + (H - PADY * 2) * (1 - v / max)

  const pontos = dados.map((d, i) => `${toX(i).toFixed(1)},${toY(d.total).toFixed(1)}`).join(' ')
  const area = [
    `M${toX(0).toFixed(1)},${(H - PADY).toFixed(1)}`,
    ...dados.map((d, i) => `L${toX(i).toFixed(1)},${toY(d.total).toFixed(1)}`),
    `L${toX(dados.length - 1).toFixed(1)},${(H - PADY).toFixed(1)}Z`,
  ].join(' ')

  // Mostra no máx 10 labels no eixo X
  const step = Math.ceil(dados.length / 10)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
        <defs>
          <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = PADY + (H - PADY * 2) * (1 - pct)
          return (
            <g key={pct}>
              <line x1={PADX} y1={y} x2={W - PADX} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PADX - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
                {pct === 0 ? '0' : `${(max * pct / 1000).toFixed(0)}k`}
              </text>
            </g>
          )
        })}
        {/* area */}
        <path d={area} fill="url(#gradVendas)" />
        {/* line */}
        <polyline points={pontos} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        {/* dots + labels */}
        {dados.map((d, i) => (
          <g key={d.dia}>
            <circle cx={toX(i)} cy={toY(d.total)} r="3" fill="#3b82f6" />
            {i % step === 0 && (
              <text x={toX(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
                {fmtDia(d.dia)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

export function PainelVendedorClient({
  ranking,
  totalGeral,
  totalVendas,
  filtros,
  vendasVendedor,
  vendasDiarias,
  resumoPedidos,
  comissaoPct = 0,
}: {
  ranking: VendedorRow[]
  totalGeral: number
  totalVendas: number
  filtros: { de: string; ate: string; vendedor: string }
  vendasVendedor: VendaRow[]
  vendasDiarias: DiaRow[]
  resumoPedidos: { orcamentos: number; finalizados: number; cancelados: number }
  comissaoPct?: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [de, setDe] = useState(filtros.de)
  const [ate, setAte] = useState(filtros.ate)
  const [vendedorSelecionado, setVendedorSelecionado] = useState(filtros.vendedor)

  const melhor = ranking[0]
  const ticketMedioGeral = totalVendas > 0 ? totalGeral / totalVendas : 0

  const mesAno = filtros.de ? filtros.de.slice(0, 7) : ''

  const aplicar = (novoVendedor?: string) => {
    const p = new URLSearchParams()
    p.set('de', de)
    p.set('ate', ate)
    const v = novoVendedor !== undefined ? novoVendedor : vendedorSelecionado
    if (v) p.set('vendedor', v)
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

      {/* Filtro */}
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
          Mês atual
        </button>
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Vendas no período', valor: fmt(totalGeral), cor: 'text-green-600' },
          { label: 'Qtd de vendas', valor: String(totalVendas), cor: 'text-blue-600' },
          { label: 'Ticket médio', valor: fmt(ticketMedioGeral), cor: 'text-purple-600' },
          { label: 'Melhor vendedor', valor: melhor?.nome ?? '—', cor: 'text-orange-500' },
        ].map(({ label, valor, cor }) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={`mt-1 text-xl font-bold truncate ${cor}`}>{valor}</p>
          </div>
        ))}
      </div>

      {/* Gráfico + resumo pedidos */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gráfico */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Fluxo de Vendas</h3>
            <span className="text-xs text-gray-400">{filtros.de} → {filtros.ate}</span>
          </div>
          <GraficoDiario dados={vendasDiarias} mesAno={mesAno} />
        </div>

        {/* Resumo pedidos */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-800">Pedidos no período</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
              <span className="text-sm font-medium text-blue-700">Orçamentos</span>
              <span className="text-lg font-bold text-blue-700">{resumoPedidos.orcamentos}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-green-50 px-4 py-3">
              <span className="text-sm font-medium text-green-700">Aprovados</span>
              <span className="text-lg font-bold text-green-700">{resumoPedidos.finalizados}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3">
              <span className="text-sm font-medium text-red-700">Cancelados</span>
              <span className="text-lg font-bold text-red-700">{resumoPedidos.cancelados}</span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm font-medium text-gray-600">Total vendas PDV</span>
              <span className="text-lg font-bold text-gray-900">{fmt(totalGeral)}</span>
            </div>
          </div>
        </div>
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
              <th className="px-5 py-3 text-right">Vendas</th>
              <th className="px-5 py-3 text-right">Descontos</th>
              <th className="px-5 py-3 text-right">Ticket Médio</th>
              <th className="px-5 py-3 text-right">Total</th>
              {comissaoPct > 0 && <th className="px-5 py-3 text-right">Comissão ({comissaoPct}%)</th>}
              <th className="px-5 py-3 text-right">Meta</th>
              <th className="px-5 py-3 text-right">% do período</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ranking.length === 0 && (
              <tr><td colSpan={comissaoPct > 0 ? 9 : 8} className="px-5 py-10 text-center text-sm text-gray-400">Nenhuma venda no período.</td></tr>
            )}
            {ranking.map((v, idx) => {
              const ticket = v.qtd > 0 ? v.total / v.qtd : 0
              const pct = totalGeral > 0 ? (v.total / totalGeral) * 100 : 0
              const meta = v.meta ?? 0
              const pctMeta = meta > 0 ? Math.min((v.total / meta) * 100, 999) : 0
              const ativo = vendedorSelecionado === v.nome
              return (
                <tr key={v.nome} onClick={() => abrirVendedor(v.nome)}
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
                  {comissaoPct > 0 && (
                    <td className="px-5 py-3 text-right font-semibold text-green-600">{fmt(v.total * comissaoPct / 100)}</td>
                  )}
                  <td className="px-5 py-3 text-right">
                    {meta > 0 ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full rounded-full ${pctMeta >= 100 ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${Math.min(pctMeta, 100)}%` }} />
                        </div>
                        <span className={`text-xs w-9 text-right ${pctMeta >= 100 ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>{pctMeta.toFixed(0)}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
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

      {/* Drill-down vendedor */}
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
