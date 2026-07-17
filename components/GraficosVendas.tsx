'use client'

import { useState } from 'react'
import { formatBRL } from '@/lib/utils'

// Dois gráficos que o Vitor pediu (existiam no SIGE e faltavam aqui).
// SVG/HTML puro, sem biblioteca de gráfico: zero dependência nova, zero peso no
// bundle — e o PDV/painel continua leve, que é o que importa pra loja.
//
// Brand: azul #1B6CA8 · laranja #F47920.

const AZUL = '#1B6CA8'
const LARANJA = '#F47920'
const VERDE = '#16a34a'
const VERMELHO = '#dc2626'
const CINZA = '#cbd5e1'

// ───────────────────────────────────────────────────────────────
// 1. FLUXO DIÁRIO DE VENDAS — barras, uma por dia do mês.
// Pedido da Isa: barras por dia e, ao passar o mouse, um box com o valor
// vendido naquele dia (referência: o gráfico de vendas do SIGE). Antes era
// linha com tooltip nativo do navegador (lento e só nos pontos).
// ───────────────────────────────────────────────────────────────
export function FluxoDiario({
  dias,
  total,
  mes,
}: {
  dias: { dia: string; valor: number; n: number }[]
  total: number
  mes: string
}) {
  const [hover, setHover] = useState<number | null>(null)

  if (dias.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">Fluxo diário de vendas</p>
        <p className="mt-6 text-center text-sm text-gray-400">Nenhuma venda no mês ainda.</p>
      </div>
    )
  }

  const max = Math.max(...dias.map((d) => d.valor), 1)
  const melhor = dias.reduce((a, d) => (d.valor > a.valor ? d : a), dias[0])
  const comVenda = dias.filter((d) => d.valor > 0).length
  const ativo = hover != null ? dias[hover] : null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">Fluxo diário de vendas</p>
        <p className="text-xs text-gray-400">{mes} · {comVenda} {comVenda === 1 ? 'dia' : 'dias'} com venda</p>
      </div>
      <p className="mb-3 text-2xl font-extrabold tabular-nums text-gray-900">{formatBRL(total)}</p>

      {/* barras + tooltip flutuante no hover */}
      <div className="relative select-none" onMouseLeave={() => setHover(null)}>
        {ativo && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-full pb-1"
            style={{ left: `${((hover! + 0.5) / dias.length) * 100}%` }}
          >
            <div className="whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-center shadow-lg">
              <div className="text-[10px] font-medium uppercase tracking-wide text-gray-300">Dia {ativo.dia}</div>
              <div className="text-sm font-bold tabular-nums text-white">{formatBRL(ativo.valor)}</div>
              <div className="text-[10px] text-gray-400">{ativo.n} {ativo.n === 1 ? 'venda' : 'vendas'}</div>
            </div>
          </div>
        )}

        <div className="flex h-[160px] items-end gap-px">
          {dias.map((d, i) => (
            <div
              key={i}
              className="flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
            >
              <div
                className="w-full rounded-t-sm transition-[background-color,opacity]"
                style={{
                  height: `${d.valor > 0 ? Math.max(3, (d.valor / max) * 100) : 0}%`,
                  backgroundColor: hover === i || (hover == null && d.dia === melhor.dia) ? LARANJA : AZUL,
                  opacity: hover == null || hover === i ? 1 : 0.4,
                }}
              />
            </div>
          ))}
        </div>

        {/* eixo: 1 dia a cada 3 pra não embolar */}
        <div className="mt-1 flex gap-px">
          {dias.map((d, i) => (
            <div key={i} className="flex-1 text-center text-[9px] text-gray-400">
              {i % 3 === 0 || i === dias.length - 1 ? d.dia : ''}
            </div>
          ))}
        </div>
      </div>

      {melhor.valor > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          Melhor dia: <b className="text-gray-600">{melhor.dia}</b> · <span style={{ color: LARANJA }} className="font-semibold">{formatBRL(melhor.valor)}</span>
        </p>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────
// 2. VISÃO GERAL DE PEDIDOS — rosca por status
// ───────────────────────────────────────────────────────────────
export function StatusPedidos({
  status,
  mes,
}: {
  status: { faturados: number; cancelados: number; aprovados: number; abertos: number }
  mes: string
}) {
  const fatias = [
    { nome: 'Faturados',  n: status.faturados,  cor: VERDE },
    { nome: 'Cancelados', n: status.cancelados, cor: VERMELHO },
    { nome: 'Aprovados sem faturar', n: status.aprovados, cor: LARANJA },
    { nome: 'Em aberto',  n: status.abertos,    cor: CINZA },
  ].filter((f) => f.n > 0)

  const total = fatias.reduce((s, f) => s + f.n, 0)

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-gray-800">Visão geral dos pedidos</p>
        <p className="mt-6 text-center text-sm text-gray-400">Nenhum pedido no mês ainda.</p>
      </div>
    )
  }

  // rosca: cada fatia é um arco desenhado com stroke-dasharray num círculo
  const R = 52, C = 2 * Math.PI * R
  let acumulado = 0
  const arcos = fatias.map((f) => {
    const frac = f.n / total
    const arco = { ...f, dash: frac * C, offset: -acumulado * C, pct: frac * 100 }
    acumulado += frac
    return arco
  })
  const cancelPct = total ? (status.cancelados / total) * 100 : 0

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">Visão geral dos pedidos</p>
        <p className="text-xs text-gray-400">{mes}</p>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="relative shrink-0">
          <svg viewBox="0 0 140 140" className="h-[140px] w-[140px] -rotate-90">
            <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
            {arcos.map((a) => (
              <circle key={a.nome} cx="70" cy="70" r={R} fill="none"
                stroke={a.cor} strokeWidth="18"
                strokeDasharray={`${a.dash} ${C - a.dash}`}
                strokeDashoffset={a.offset}>
                <title>{`${a.nome}: ${a.n} (${a.pct.toFixed(1)}%)`}</title>
              </circle>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-extrabold tabular-nums text-gray-900">{total.toLocaleString('pt-BR')}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">pedidos</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {arcos.map((a) => (
            <div key={a.nome} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.cor }} />
              <span className="min-w-0 flex-1 truncate text-gray-600">{a.nome}</span>
              <span className="tabular-nums font-semibold text-gray-800">{a.n.toLocaleString('pt-BR')}</span>
              <span className="w-11 text-right tabular-nums text-xs text-gray-400">{a.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {cancelPct >= 15 && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {cancelPct.toFixed(0)}% dos pedidos do mês foram cancelados — vale olhar o motivo.
        </p>
      )}
    </div>
  )
}
