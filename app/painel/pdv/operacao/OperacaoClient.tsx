'use client'

import { useState } from 'react'
import { abrirCaixa, fecharCaixa, registrarReforco, registrarRetirada } from './actions'

type Panel = 'fechar' | 'reforco' | 'retirada' | 'saldo' | null

interface Movimento {
  id: string
  tipo: string
  motivo: string | null
  forma_pagamento: string
  valor: number
  created_at: string
}

interface CaixaAberto {
  id: string
  aberto_em: string
  valor_abertura: number
  status: string
}

interface Historico {
  id: string
  aberto_em: string
  fechado_em: string | null
  valor_abertura: number
  valor_fechamento: number | null
  status: string
}

interface VendaDia {
  id: string
  total: number
  created_at: string
}

interface ProdutoResumo {
  nome: string
  qtd: number
  total: number
}

interface Props {
  caixaAberto: CaixaAberto | null
  totalVendas: number
  totalCrediario: number
  totalReforcos: number
  totalRetiradas: number
  totalDevolucoes: number
  qtdVendas: number
  movimentos: Movimento[]
  historico: Historico[]
  vendasDia: VendaDia[]
  porProduto: Record<string, ProdutoResumo>
  formas: string[]
  erro?: string
}

export function OperacaoClient({
  caixaAberto,
  totalVendas,
  totalCrediario,
  totalReforcos,
  totalRetiradas,
  totalDevolucoes,
  qtdVendas,
  movimentos,
  historico,
  vendasDia,
  porProduto,
  formas,
  erro,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null)
  const toggle = (p: Panel) => setPanel(prev => (prev === p ? null : p))

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR')
  const fmtHora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const totalVendasReais = totalVendas - totalCrediario
  const saldoCaixa =
    (caixaAberto?.valor_abertura ?? 0) + totalVendasReais + totalReforcos - totalRetiradas - totalDevolucoes
  const saldoTotal = saldoCaixa + totalCrediario

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <a href="/painel/pdv" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h2 className="text-2xl font-bold text-gray-900">Operação do PDV</h2>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      {/* Status do caixa */}
      <div className={`rounded-2xl border p-5 ${caixaAberto ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Status do Caixa</p>
            <p className={`text-xl font-bold mt-0.5 ${caixaAberto ? 'text-green-700' : 'text-gray-500'}`}>
              {caixaAberto ? 'Aberto' : 'Fechado'}
            </p>
            {caixaAberto && (
              <p className="text-xs text-gray-500 mt-1">
                Aberto em {fmtDate(caixaAberto.aberto_em)} · Saldo inicial: {fmt(caixaAberto.valor_abertura ?? 0)}
              </p>
            )}
          </div>
          <div className={`h-3 w-3 rounded-full ${caixaAberto ? 'bg-green-500' : 'bg-gray-300'}`} />
        </div>
      </div>

      {/* ─── Caixa ABERTO: 5 cards de operação ─── */}
      {caixaAberto ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Fechar Caixa */}
            <button
              onClick={() => toggle('fechar')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'fechar'
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-blue-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className="mb-2 text-2xl">🔒</div>
              <p className="text-sm font-semibold text-blue-800">Fechar Caixa</p>
            </button>

            {/* Reforçar Caixa */}
            <button
              onClick={() => toggle('reforco')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'reforco'
                  ? 'border-green-400 bg-green-50'
                  : 'border-green-200 bg-white hover:border-green-300'
              }`}
            >
              <div className="mb-2 text-2xl">💰</div>
              <p className="text-sm font-semibold text-green-800">Reforçar Caixa</p>
            </button>

            {/* Retirada */}
            <button
              onClick={() => toggle('retirada')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'retirada'
                  ? 'border-red-400 bg-red-50'
                  : 'border-red-200 bg-white hover:border-red-300'
              }`}
            >
              <div className="mb-2 text-2xl">💸</div>
              <p className="text-sm font-semibold text-red-800">Retirada</p>
            </button>

            {/* Devolução — em breve */}
            <div className="rounded-2xl border border-amber-100 bg-gray-50 p-4 opacity-50 cursor-not-allowed">
              <div className="mb-2 text-2xl">↩️</div>
              <p className="text-sm font-semibold text-amber-800">Devolução</p>
              <p className="text-xs text-gray-400 mt-0.5">Em breve</p>
            </div>

            {/* Saldo em Caixa */}
            <button
              onClick={() => toggle('saldo')}
              className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                panel === 'saldo'
                  ? 'border-cyan-400 bg-cyan-50'
                  : 'border-cyan-200 bg-white hover:border-cyan-300'
              }`}
            >
              <div className="mb-2 text-2xl">📊</div>
              <p className="text-sm font-semibold text-cyan-800">Saldo em Caixa</p>
              <p className="text-xs font-bold text-cyan-600 mt-1">{fmt(saldoCaixa)}</p>
            </button>
          </div>

          {/* ─── Painéis ─── */}

          {/* FECHAR CAIXA */}
          {panel === 'fechar' && (
            <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm space-y-5">
              <h3 className="font-semibold text-gray-800 text-lg">Fechamento de Caixa</h3>

              {/* Breakdown */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {[
                    { label: 'Saldo na Abertura', valor: caixaAberto.valor_abertura, color: 'text-gray-700' },
                    { label: 'Saldo em Vendas (dinheiro/cartão/pix)', valor: totalVendasReais, color: 'text-green-600' },
                    { label: 'Saldo Crediário', valor: totalCrediario, color: 'text-orange-600' },
                    { label: 'Total Reforçado', valor: totalReforcos, color: 'text-green-600' },
                    { label: 'Total Sangrado', valor: -totalRetiradas, color: 'text-red-600' },
                    { label: 'Total de Devoluções', valor: -totalDevolucoes, color: 'text-red-600' },
                  ].map(({ label, valor, color }) => (
                    <div key={label} className="flex justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-600">{label}</span>
                      <span className={`font-semibold ${color}`}>{fmt(Math.abs(valor))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-4 py-3 bg-blue-50 font-bold text-sm">
                    <span className="text-blue-900">Saldo em Caixa (físico)</span>
                    <span className="text-blue-700">{fmt(saldoCaixa)}</span>
                  </div>
                </div>
              </div>

              <form action={fecharCaixa.bind(null, caixaAberto.id)} className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-48">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor Contado no Caixa (R$)</label>
                  <input
                    name="valor_fechamento"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={saldoCaixa.toFixed(2)}
                    className="field"
                  />
                </div>
                <div className="flex-1 min-w-48">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
                  <input name="obs_fechamento" className="field" placeholder="Opcional" />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
                >
                  Fechar Caixa
                </button>
              </form>
            </div>
          )}

          {/* REFORÇAR CAIXA */}
          {panel === 'reforco' && (
            <div className="rounded-2xl border border-green-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-800 text-lg">Reforçar Caixa</h3>
              <p className="text-sm text-gray-500">Registra entrada de dinheiro no caixa (não é uma venda).</p>
              <form action={registrarReforco.bind(null, caixaAberto.id)} className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-40">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma de Pagamento</label>
                  <select name="forma_pagamento" className="field">
                    {formas.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-40">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Motivo</label>
                  <input name="motivo" className="field" placeholder="Ex: Troco, reposição..." />
                </div>
                <div className="w-40">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (R$)</label>
                  <input name="valor" type="number" step="0.01" min="0.01" className="field" required />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition"
                >
                  Registrar Reforço
                </button>
              </form>

              {/* Histórico de reforços do caixa */}
              {movimentos.filter(m => m.tipo === 'reforco').length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reforços deste caixa</p>
                  <div className="space-y-1">
                    {movimentos.filter(m => m.tipo === 'reforco').map(m => (
                      <div key={m.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                        <span className="text-gray-500">{fmtHora(m.created_at)} · {m.forma_pagamento}{m.motivo ? ` — ${m.motivo}` : ''}</span>
                        <span className="font-semibold text-green-600">{fmt(m.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RETIRADA */}
          {panel === 'retirada' && (
            <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-800 text-lg">Retirada (Sangria)</h3>
              <p className="text-sm text-gray-500">Registra saída de dinheiro do caixa sem ser uma compra.</p>
              <form action={registrarRetirada.bind(null, caixaAberto.id)} className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-40">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma de Pagamento</label>
                  <select name="forma_pagamento" className="field">
                    {formas.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-40">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Motivo</label>
                  <input name="motivo" className="field" placeholder="Ex: pagamento fornecedor..." />
                </div>
                <div className="w-40">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor (R$)</label>
                  <input name="valor" type="number" step="0.01" min="0.01" className="field" required />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition"
                >
                  Registrar Retirada
                </button>
              </form>

              {/* Histórico de retiradas do caixa */}
              {movimentos.filter(m => m.tipo === 'retirada').length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Retiradas deste caixa</p>
                  <div className="space-y-1">
                    {movimentos.filter(m => m.tipo === 'retirada').map(m => (
                      <div key={m.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                        <span className="text-gray-500">{fmtHora(m.created_at)} · {m.forma_pagamento}{m.motivo ? ` — ${m.motivo}` : ''}</span>
                        <span className="font-semibold text-red-600">{fmt(m.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SALDO EM CAIXA */}
          {panel === 'saldo' && (
            <div className="rounded-2xl border border-cyan-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-800 text-lg">Saldo do Caixa</h3>
              <div className="rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {[
                    { label: 'Saldo na Abertura', valor: caixaAberto.valor_abertura, color: 'text-gray-700' },
                    { label: 'Saldo em Vendas (dinheiro/cartão/pix)', valor: totalVendasReais, color: 'text-green-600' },
                    { label: 'Saldo Crediário', valor: totalCrediario, color: 'text-orange-600' },
                    { label: 'Total Reforçado', valor: totalReforcos, color: 'text-green-600' },
                    { label: 'Total Sangrado', valor: totalRetiradas, color: 'text-red-600' },
                    { label: 'Total de Devoluções', valor: totalDevolucoes, color: 'text-red-600' },
                  ].map(({ label, valor, color }) => (
                    <div key={label} className="flex justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-600">{label}</span>
                      <span className={`font-semibold ${color}`}>{fmt(valor)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-4 py-3 bg-cyan-50 font-bold text-sm">
                    <span className="text-cyan-900">Total do Saldo (incl. crediário)</span>
                    <span className="text-cyan-700">{fmt(saldoTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Detalhamento de vendas */}
              {qtdVendas > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vendas ({qtdVendas} transações)</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {vendasDia.map(v => (
                      <div key={v.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="text-gray-400 font-mono">{fmtHora(v.created_at)}</span>
                        <span className="font-semibold text-gray-700">{fmt(v.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resumo de itens vendidos */}
          {Object.keys(porProduto).length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Itens Vendidos (caixa atual)</h3>
                <span className="text-xs text-gray-400">{qtdVendas} venda{qtdVendas !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {Object.values(porProduto)
                  .sort((a, b) => b.total - a.total)
                  .map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-6 py-2.5 text-sm">
                      <span className="text-gray-700">{p.nome}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400">{p.qtd} un.</span>
                        <span className="font-semibold text-gray-900 w-24 text-right">{fmt(p.total)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ─── Caixa FECHADO: só Abrir Caixa ─── */
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Abrir Caixa</h3>
          <form action={abrirCaixa} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor de Abertura (R$)</label>
              <input name="valor_abertura" type="number" step="0.01" min="0" defaultValue="0" className="field" />
            </div>
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
              <input name="obs_abertura" className="field" placeholder="Opcional" />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition"
            >
              Abrir Caixa
            </button>
          </form>
        </div>
      )}

      {/* Histórico de caixas */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Histórico de Caixas</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Abertura</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fechamento</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Inicial</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Final</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {historico.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(c.aberto_em)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.fechado_em ? fmtDate(c.fechado_em) : '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(c.valor_abertura ?? 0)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {c.valor_fechamento != null ? fmt(c.valor_fechamento) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === 'aberto' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
