'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import {
  abrirCaixa,
  fecharCaixa,
  registrarReforco,
  registrarRetirada,
  type ActionState,
} from './actions'

// ─── Utilitários (módulo-level, não recriados a cada render) ────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR')
const fmtHora = (d: string) =>
  new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const FORMAS_INVALIDAS = ['Crédito Loja (Fiado)', 'Crediário', 'Crédito Loja']

// ─── Tipos ──────────────────────────────────────────────────────────────────
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

// ─── FeedbackMsg ─────────────────────────────────────────────────────────────
function FeedbackMsg({ state }: { state: ActionState }) {
  if (!state) return null
  return (
    <p className={`text-sm font-medium ${state.ok ? 'text-green-600' : 'text-red-600'}`}>
      {state.ok ? '✓' : '✗'} {state.message}
    </p>
  )
}

// ─── Painéis como sub-componentes ────────────────────────────────────────────
// Cada painel monta/desmonta quando o card é aberto/fechado.
// O useActionState fica no sub-componente → state reseta ao reabrir.

function AbrirCaixaPanel() {
  const [state, action, pending] = useActionState<ActionState, FormData>(abrirCaixa, null)
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800">Abrir Caixa</h3>
      <form action={action} className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-48">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Valor de Abertura (R$)
          </label>
          <input
            name="valor_abertura"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className="field"
          />
        </div>
        <div className="flex-1 min-w-48">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
          <input name="obs_abertura" className="field" placeholder="Opcional" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-50"
        >
          {pending ? 'Abrindo...' : 'Abrir Caixa'}
        </button>
      </form>
      <FeedbackMsg state={state} />
    </div>
  )
}

function FecharCaixaPanel({
  caixaId,
  valorAbertura,
  totalVendasReais,
  totalCrediario,
  totalReforcos,
  totalRetiradas,
  totalDevolucoes,
  saldoCaixa,
}: {
  caixaId: string
  valorAbertura: number
  totalVendasReais: number
  totalCrediario: number
  totalReforcos: number
  totalRetiradas: number
  totalDevolucoes: number
  saldoCaixa: number
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(fecharCaixa, null)
  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm space-y-5">
      <h3 className="font-semibold text-gray-800 text-lg">Fechamento de Caixa</h3>
      <div className="rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {[
            { label: 'Saldo na Abertura', valor: valorAbertura, color: 'text-gray-700' },
            { label: 'Saldo em Vendas (excl. crediário)', valor: totalVendasReais, color: 'text-green-600' },
            { label: 'Saldo Crediário (a receber)', valor: totalCrediario, color: 'text-orange-500' },
            { label: 'Total Reforçado', valor: totalReforcos, color: 'text-green-600' },
            { label: 'Total Sangrado', valor: totalRetiradas, color: 'text-red-500' },
            { label: 'Total de Devoluções', valor: totalDevolucoes, color: 'text-red-500' },
          ].map(({ label, valor, color }) => (
            <div key={label} className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-600">{label}</span>
              <span className={`font-semibold ${color}`}>{fmt(valor)}</span>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 bg-blue-50 font-bold text-sm">
            <span className="text-blue-900">Saldo Físico em Caixa</span>
            <span className="text-blue-700">{fmt(saldoCaixa)}</span>
          </div>
        </div>
      </div>
      <form action={action} className="flex flex-wrap gap-4 items-end">
        <input type="hidden" name="caixa_id" value={caixaId} />
        <div className="flex-1 min-w-48">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Valor Contado no Caixa (R$)
          </label>
          <input
            name="valor_fechamento"
            type="number"
            step="0.01"
            min="0"
            defaultValue={saldoCaixa.toFixed(2)}
            className="field"
            required
          />
        </div>
        <div className="flex-1 min-w-48">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
          <input name="obs_fechamento" className="field" placeholder="Opcional" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
        >
          {pending ? 'Fechando...' : 'Fechar Caixa'}
        </button>
      </form>
      <FeedbackMsg state={state} />
    </div>
  )
}

function ReforcoPanel({
  caixaId,
  formasFisicas,
  movimentos,
}: {
  caixaId: string
  formasFisicas: string[]
  movimentos: Movimento[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registrarReforco, null)
  const lista = movimentos.filter((m) => m.tipo === 'reforco')
  return (
    <div className="rounded-2xl border border-green-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">Reforçar Caixa</h3>
      <p className="text-sm text-gray-500">Entrada de dinheiro no caixa (não é venda).</p>
      <form action={action} className="flex flex-wrap gap-4 items-end">
        <input type="hidden" name="caixa_id" value={caixaId} />
        <div className="flex-1 min-w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma</label>
          <select name="forma_pagamento" className="field">
            {formasFisicas.map((f) => <option key={f} value={f}>{f}</option>)}
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
          disabled={pending}
          className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition disabled:opacity-50"
        >
          {pending ? 'Salvando...' : 'Registrar Reforço'}
        </button>
      </form>
      <FeedbackMsg state={state} />
      {lista.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Reforços deste caixa
          </p>
          <div className="space-y-1">
            {lista.map((m) => (
              <div key={m.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                <span className="text-gray-500">
                  {fmtHora(m.created_at)} · {m.forma_pagamento}
                  {m.motivo ? ` — ${m.motivo}` : ''}
                </span>
                <span className="font-semibold text-green-600">{fmt(m.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RetiradaPanel({
  caixaId,
  formasFisicas,
  movimentos,
}: {
  caixaId: string
  formasFisicas: string[]
  movimentos: Movimento[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(registrarRetirada, null)
  const lista = movimentos.filter((m) => m.tipo === 'retirada')
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">Retirada (Sangria)</h3>
      <p className="text-sm text-gray-500">Saída de dinheiro do caixa sem ser compra.</p>
      <form action={action} className="flex flex-wrap gap-4 items-end">
        <input type="hidden" name="caixa_id" value={caixaId} />
        <div className="flex-1 min-w-40">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Forma</label>
          <select name="forma_pagamento" className="field">
            {formasFisicas.map((f) => <option key={f} value={f}>{f}</option>)}
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
          disabled={pending}
          className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
        >
          {pending ? 'Salvando...' : 'Registrar Retirada'}
        </button>
      </form>
      <FeedbackMsg state={state} />
      {lista.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Retiradas deste caixa
          </p>
          <div className="space-y-1">
            {lista.map((m) => (
              <div key={m.id} className="flex justify-between text-sm py-1.5 border-b border-gray-50">
                <span className="text-gray-500">
                  {fmtHora(m.created_at)} · {m.forma_pagamento}
                  {m.motivo ? ` — ${m.motivo}` : ''}
                </span>
                <span className="font-semibold text-red-600">{fmt(m.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SaldoPanel({
  caixaAberto,
  totalVendasReais,
  totalCrediario,
  totalReforcos,
  totalRetiradas,
  totalDevolucoes,
  saldoCaixa,
  saldoTotal,
  vendasDia,
  qtdVendas,
}: {
  caixaAberto: CaixaAberto
  totalVendasReais: number
  totalCrediario: number
  totalReforcos: number
  totalRetiradas: number
  totalDevolucoes: number
  saldoCaixa: number
  saldoTotal: number
  vendasDia: VendaDia[]
  qtdVendas: number
}) {
  return (
    <div className="rounded-2xl border border-cyan-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-gray-800 text-lg">Saldo do Caixa</h3>
      <div className="rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {[
            { label: 'Saldo na Abertura', valor: caixaAberto.valor_abertura, color: 'text-gray-700' },
            { label: 'Saldo em Vendas (excl. crediário)', valor: totalVendasReais, color: 'text-green-600' },
            { label: 'Saldo Crediário (a receber)', valor: totalCrediario, color: 'text-orange-500' },
            { label: 'Total Reforçado', valor: totalReforcos, color: 'text-green-600' },
            { label: 'Total Sangrado', valor: totalRetiradas, color: 'text-red-500' },
            { label: 'Total de Devoluções', valor: totalDevolucoes, color: 'text-red-500' },
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
      {vendasDia.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Vendas ({qtdVendas})
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {vendasDia.map((v) => (
              <div key={v.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                <span className="text-gray-400 font-mono">{fmtHora(v.created_at)}</span>
                <span className="font-semibold text-gray-700">{fmt(v.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
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
  const toggle = (p: Panel) => setPanel((prev) => (prev === p ? null : p))

  const formasFisicas = formas.filter((f) => !FORMAS_INVALIDAS.some((inv) => f.includes(inv)))
  const totalVendasReais = totalVendas - totalCrediario
  const saldoCaixa =
    (caixaAberto?.valor_abertura ?? 0) +
    totalVendasReais +
    totalReforcos -
    totalRetiradas -
    totalDevolucoes
  const saldoTotal = saldoCaixa + totalCrediario

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/painel/pdv" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Operação do PDV</h2>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      {/* Status */}
      <div className={`rounded-2xl border p-5 ${caixaAberto ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Status do Caixa</p>
            <p className={`text-xl font-bold mt-0.5 ${caixaAberto ? 'text-green-700' : 'text-gray-500'}`}>
              {caixaAberto ? 'Aberto' : 'Fechado'}
            </p>
            {caixaAberto && (
              <p className="text-xs text-gray-500 mt-1">
                Aberto em {fmtDate(caixaAberto.aberto_em)} · Saldo inicial:{' '}
                {fmt(caixaAberto.valor_abertura ?? 0)}
              </p>
            )}
          </div>
          <div className={`h-3 w-3 rounded-full ${caixaAberto ? 'bg-green-500' : 'bg-gray-300'}`} />
        </div>
      </div>

      {caixaAberto ? (
        <>
          {/* Resumo rápido */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total em Vendas</p>
              <p className="mt-1 text-xl font-bold text-green-600">{fmt(totalVendas)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nº de Vendas</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{qtdVendas}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ticket Médio</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {qtdVendas > 0 ? fmt(totalVendas / qtdVendas) : '—'}
              </p>
            </div>
          </div>

          {/* 5 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {(
              [
                { key: 'fechar', icon: '🔒', label: 'Fechar Caixa', border: 'blue' },
                { key: 'reforco', icon: '💰', label: 'Reforçar Caixa', border: 'green' },
                { key: 'retirada', icon: '💸', label: 'Retirada', border: 'red' },
              ] as const
            ).map(({ key, icon, label, border }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`rounded-2xl border p-4 text-left transition hover:shadow-md ${
                  panel === key
                    ? `border-${border}-400 bg-${border}-50`
                    : `border-${border}-200 bg-white hover:border-${border}-300`
                }`}
              >
                <div className="mb-2 text-2xl">{icon}</div>
                <p className={`text-sm font-semibold text-${border}-800`}>{label}</p>
              </button>
            ))}

            <div className="rounded-2xl border border-amber-100 bg-gray-50 p-4 opacity-50 select-none">
              <div className="mb-2 text-2xl">↩️</div>
              <p className="text-sm font-semibold text-amber-800">Devolução</p>
              <p className="text-xs text-gray-400 mt-0.5">Em breve</p>
            </div>

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

          {/* Painéis — montam/desmontam para resetar useActionState */}
          {panel === 'fechar' && (
            <FecharCaixaPanel
              caixaId={caixaAberto.id}
              valorAbertura={caixaAberto.valor_abertura}
              totalVendasReais={totalVendasReais}
              totalCrediario={totalCrediario}
              totalReforcos={totalReforcos}
              totalRetiradas={totalRetiradas}
              totalDevolucoes={totalDevolucoes}
              saldoCaixa={saldoCaixa}
            />
          )}
          {panel === 'reforco' && (
            <ReforcoPanel
              caixaId={caixaAberto.id}
              formasFisicas={formasFisicas}
              movimentos={movimentos}
            />
          )}
          {panel === 'retirada' && (
            <RetiradaPanel
              caixaId={caixaAberto.id}
              formasFisicas={formasFisicas}
              movimentos={movimentos}
            />
          )}
          {panel === 'saldo' && (
            <SaldoPanel
              caixaAberto={caixaAberto}
              totalVendasReais={totalVendasReais}
              totalCrediario={totalCrediario}
              totalReforcos={totalReforcos}
              totalRetiradas={totalRetiradas}
              totalDevolucoes={totalDevolucoes}
              saldoCaixa={saldoCaixa}
              saldoTotal={saldoTotal}
              vendasDia={vendasDia}
              qtdVendas={qtdVendas}
            />
          )}

          {/* Itens vendidos */}
          {Object.keys(porProduto).length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Itens Vendidos (caixa atual)</h3>
                <span className="text-xs text-gray-400">
                  {qtdVendas} venda{qtdVendas !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {Object.entries(porProduto)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([produtoId, p]) => (
                    <div key={produtoId} className="flex items-center justify-between px-6 py-2.5 text-sm">
                      <span className="text-gray-700">{p.nome}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400">{p.qtd} un.</span>
                        <span className="font-semibold text-gray-900 w-24 text-right">
                          {fmt(p.total)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <AbrirCaixaPanel />
      )}

      {/* Histórico */}
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
                <td className="px-4 py-3 text-sm text-gray-500">
                  {c.fechado_em ? fmtDate(c.fechado_em) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">
                  {fmt(c.valor_abertura ?? 0)}
                </td>
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
