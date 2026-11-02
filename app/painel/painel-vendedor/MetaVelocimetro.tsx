'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarMetaPago } from './actions'

type Faixa = { nome: string; valor: number }

// Velocímetro de meta — desenho copiado do "Índice de Medo e Ganância" (arco de
// 180°, gradiente vermelho→verde, número grande no centro, agulha). Sobe com o
// PAGAMENTO REAL da loja e atualiza sozinho via Supabase Realtime + poll de 60s.
const CX = 120
const CY = 104
const R = 88

function pt(angDeg: number) {
  const rad = (angDeg * Math.PI) / 180
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) }
}
function arco(a1: number, a2: number) {
  const p1 = pt(a1)
  const p2 = pt(a2)
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
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

  const refresh = () => buscarMetaPago(de, ate).then(setPago).catch(() => {})
  const refreshDebounced = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(refresh, 1200)
  }

  useEffect(() => {
    refresh()
    const sb = createClient()
    const chan = sb
      .channel('meta-velocimetro')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pagamentos_venda', filter: 'status=eq.pago' }, () => refreshDebounced())
      .subscribe()
    const interval = setInterval(refresh, 60000)
    return () => {
      sb.removeChannel(chan)
      if (timer.current) clearTimeout(timer.current)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate])

  if (!faixas.length) {
    return (
      <div className="rounded-2xl bg-[#111827] px-4 py-6 text-center text-sm text-gray-400">
        Sem meta cadastrada pra esta loja.
      </div>
    )
  }

  const topo = faixas[faixas.length - 1].valor
  const pct = topo > 0 ? Math.min(100, Math.round((pago / topo) * 100)) : 0
  const ang = 180 - (Math.min(pago, topo) / topo) * 180
  const ponteiro = pt(ang)

  let faixaNome = 'A caminho'
  for (const f of faixas) if (pago >= f.valor) faixaNome = f.nome

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  const fmtCurto = (v: number) => (v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k' : String(v))

  return (
    <div className="rounded-2xl bg-[#111827] p-5 text-white shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{rotulo}</p>
        <p className="text-xs text-gray-400">realizado {fmtBRL(pago)}</p>
      </div>

      <svg viewBox="0 0 240 128" className="mt-1 w-full" role="img" aria-label="Velocímetro da meta">
        <defs>
          <linearGradient id="metaGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="33%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="66%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* arco de fundo + gradiente */}
        <path d={arco(180, 0)} stroke="#1f2937" strokeWidth="15" fill="none" strokeLinecap="round" />
        <path d={arco(180, ang)} stroke="url(#metaGrad)" strokeWidth="15" fill="none" strokeLinecap="round" />

        {/* marcas das faixas */}
        {faixas.slice(0, -1).map((f) => {
          const a = 180 - (f.valor / topo) * 180
          const p1 = pt(a)
          const p2 = { x: CX + (R - 10) * Math.cos((a * Math.PI) / 180), y: CY - (R - 10) * Math.sin((a * Math.PI) / 180) }
          return <line key={f.nome} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#111827" strokeWidth="3" />
        })}

        {/* agulha */}
        <line x1={CX} y1={CY} x2={ponteiro.x} y2={ponteiro.y} stroke="#f8fafc" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="6" fill="#f8fafc" />

        {/* número grande + faixa */}
        <text x={CX} y={CY - 14} textAnchor="middle" className="fill-white" style={{ font: '700 40px ui-sans-serif, system-ui' }}>
          {pct}%
        </text>
        <text x={CX} y={CY + 24} textAnchor="middle" className="fill-gray-400" style={{ font: '600 13px ui-sans-serif, system-ui' }}>
          {faixaNome}
        </text>

        {/* pontas 0 e máximo */}
        <text x={CX - R - 4} y={CY + 6} textAnchor="middle" className="fill-gray-500" style={{ font: '600 11px ui-sans-serif, system-ui' }}>
          0
        </text>
        <text x={CX + R + 4} y={CY + 6} textAnchor="middle" className="fill-gray-500" style={{ font: '600 11px ui-sans-serif, system-ui' }}>
          {fmtCurto(topo)}
        </text>
      </svg>

      {/* legenda das faixas */}
      <div className="mt-1 flex justify-between px-1 text-[10px] text-gray-400">
        {faixas.map((f, i) => (
          <span key={f.nome} className="flex flex-col items-center gap-0.5">
            <span className="font-semibold" style={{ color: ['#ef4444', '#f97316', '#84cc16', '#10b981'][i] ?? '#10b981' }}>{f.nome}</span>
            <span className="tabular-nums">{fmtCurto(f.valor)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
