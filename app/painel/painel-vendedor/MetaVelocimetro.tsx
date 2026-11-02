'use client'

import { useEffect, useRef, useState } from 'react'
import { buscarMinhaVenda } from './actions'

// Velocímetro de meta individual (inspirado no Speedtest / Fear & Greed).
// Escala 0–100, arco de 180°, 4 zonas de cor, agulha branca com o % na ponta.
// O ponteiro parte do zero e sobe suavemente até o percentual real (ease-out),
// e volta a se mover quando o percentual muda após uma venda (poll de 60s).
const CX = 100
const CY = 98
const R = 74

function pt(angDeg: number, r = R) {
  const rad = (angDeg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) }
}
function arco(a1: number, a2: number) {
  const p1 = pt(a1)
  const p2 = pt(a2)
  const large = Math.abs(a2 - a1) > 180 ? 1 : 0
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
}
// % → ângulo: 0% = esquerda (180°), 100% = direita (0°)
const angDe = (p: number) => 180 - Math.min(100, Math.max(0, p)) * 1.8

const ZONAS = [
  { de: 0, ate: 30, cor: '#ef4444' },
  { de: 30, ate: 50, cor: '#f97316' },
  { de: 50, ate: 75, cor: '#facc15' },
  { de: 75, ate: 100, cor: '#22c55e' },
]

export function MetaVelocimetro({
  meta,
  vendido,
  rotulo,
}: {
  meta: number
  vendido: number
  rotulo: string
}) {
  const [real, setReal] = useState(vendido)
  const [anim, setAnim] = useState(0)
  const animRef = useRef(0)

  const pct = meta > 0 ? Math.min(100, (real / meta) * 100) : 0
  const falta = Math.max(0, meta - real)

  // anima o ponteiro (respeita prefers-reduced-motion)
  useEffect(() => {
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduzido) {
      animRef.current = pct
      setAnim(pct)
      return
    }
    const de = animRef.current
    const inicio = performance.now()
    const duracao = 1200
    let raf = 0
    const tick = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao)
      const e = 1 - Math.pow(1 - t, 3) // easeOutCubic
      const v = de + (pct - de) * e
      animRef.current = v
      setAnim(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pct])

  // atualiza o vendido a cada 60s (pega a venda feita no PDV sem recarregar)
  useEffect(() => {
    const id = setInterval(() => buscarMinhaVenda().then(setReal).catch(() => {}), 60000)
    return () => clearInterval(id)
  }, [])

  if (meta <= 0) {
    return (
      <div className="rounded-2xl bg-[#0d1117] px-5 py-8 text-center">
        <p className="text-sm font-semibold text-gray-300">{rotulo}</p>
        <p className="mt-2 text-xs text-gray-500">Sem meta definida — peça pro gerente configurar.</p>
      </div>
    )
  }

  const ang = angDe(anim)
  const ponta = pt(ang)
  const rotuloPonta = pt(ang, R + 22)
  const pctInt = Math.round(anim)

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

  return (
    <div className="rounded-2xl bg-[#0d1117] p-5 text-white shadow-lg ring-1 ring-white/5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-200">{rotulo}</p>
        <p className="text-xs text-gray-500">faltam {fmtBRL(falta)}</p>
      </div>

      <svg viewBox="0 0 200 116" className="mx-auto mt-1 w-full max-w-[280px]" role="img" aria-label="Velocímetro da meta">
        {/* zonas de cor */}
        {ZONAS.map((z) => (
          <path key={z.cor} d={arco(angDe(z.de), angDe(z.ate))} stroke={z.cor} strokeWidth="14" fill="none" strokeLinecap="butt" opacity="0.9" />
        ))}

        {/* agulha branca */}
        <line x1={CX} y1={CY} x2={ponta.x} y2={ponta.y} stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="5" fill="#ffffff" />

        {/* percentual na ponta da agulha */}
        <text x={rotuloPonta.x} y={rotuloPonta.y} textAnchor="middle" dominantBaseline="middle" className="fill-white" style={{ font: '800 15px ui-sans-serif, system-ui' }}>
          {pctInt}%
        </text>
      </svg>

      {/* percentual grande abaixo */}
      <p className="mt-1 text-center text-5xl font-extrabold tabular-nums leading-none">{pctInt}%</p>
      <p className="mt-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">da meta</p>

      {/* indicador rumo à meta */}
      <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 13V3M4 7l4-4 4 4" />
        </svg>
        RUMO À META
      </div>
    </div>
  )
}
