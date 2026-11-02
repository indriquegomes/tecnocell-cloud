'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarMetaPago } from './actions'

type Faixa = { nome: string; valor: number }

// Semi-círculo (velocímetro) tipo "medidor de medo das criptos": arco da
// esquerda (0) pra direita (meta máxima), dividido nas 4 faixas, com ponteiro
// na posição do PAGAMENTO REAL até agora. Atualiza sozinho via Supabase Realtime
// quando entra um pagamento 'pago' — e tem poll de segurança a cada 60s.
const CORES = ['#ef4444', '#f59e0b', '#84cc16', '#10b981']
const CX = 120
const CY = 108
const R = 88

function pt(angDeg: number) {
  const rad = (angDeg * Math.PI) / 180
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) }
}

export function MetaVelocimetro({
  faixas,
  pagoInicial,
  de,
  ate,
  rotulo,
}: {
  faixas: Faixa[]
  pagoInicial: number
  de: string
  ate: string
  rotulo: string
}) {
  const [pago, setPago] = useState(pagoInicial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const topo = faixas.length ? faixas[faixas.length - 1].valor : 0

  const refresh = () => {
    buscarMetaPago(de, ate).then(setPago).catch(() => {})
  }
  const refreshDebounced = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(refresh, 1200)
  }

  useEffect(() => {
    const sb = createClient()
    const chan = sb
      .channel('meta-velocimetro')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pagamentos_venda', filter: 'status=eq.pago' },
        () => refreshDebounced(),
      )
      .subscribe()
    const interval = setInterval(refresh, 60000)
    return () => {
      sb.removeChannel(chan)
      if (timer.current) clearTimeout(timer.current)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate])

  // sem faixas = sem meta cadastrada pra loja
  if (!faixas.length || topo <= 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-xs text-gray-400">
        Sem meta cadastrada pra esta loja.
      </div>
    )
  }

  const anguloDe = (v: number) => 180 - (Math.min(v, topo) / topo) * 180
  const angPonteiro = anguloDe(pago)
  const ponteiro = pt(angPonteiro)

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  // arcos das 4 faixas (limites acumulados)
  const limites = [0, ...faixas.map((f) => f.valor)]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-gray-700">{rotulo}</p>
        <p className="text-[11px] text-gray-400">{fmtBRL(pago)} / {fmtBRL(topo)}</p>
      </div>
      <svg viewBox="0 0 240 120" className="w-full" role="img" aria-label="Velocímetro da meta">
        {/* arco de fundo */}
        <path d={arco(180, 0)} stroke="#e5e7eb" strokeWidth="16" fill="none" strokeLinecap="round" />
        {/* zonas das faixas */}
        {faixas.map((f, i) => (
          <path
            key={f.nome}
            d={arco(anguloDe(limites[i]), anguloDe(limites[i + 1]))}
            stroke={CORES[i] ?? '#10b981'}
            strokeWidth="16"
            fill="none"
          />
        ))}
        {/* ponteiro */}
        <line x1={CX} y1={CY} x2={ponteiro.x} y2={ponteiro.y} stroke="#111827" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="6" fill="#111827" />
      </svg>
      {/* legenda das faixas */}
      <div className="mt-1 flex justify-between px-1 text-[10px] leading-tight text-gray-500">
        {faixas.map((f) => (
          <span key={f.nome} className="flex flex-col items-center gap-0.5">
            <span className="font-semibold" style={{ color: CORES[faixas.indexOf(f)] ?? '#10b981' }}>{f.nome}</span>
            <span className="tabular-nums">{fmtBRL(f.valor)}</span>
          </span>
        ))}
      </div>
    </div>
  )

  function arco(a1: number, a2: number) {
    const p1 = pt(a1)
    const p2 = pt(a2)
    const large = Math.abs(a2 - a1) > 180 ? 1 : 0
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
}
