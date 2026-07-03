'use client'

// Gráficos SVG leves (sem dependência externa — CSP-safe).
// Paleta: azul #1B6CA8, laranja #F47920, verde/vermelho pra dinheiro.

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))

// ---------- Fluxo de Caixa: barras entrada/saída + linha do acumulado ----------
export function FluxoChart({ dados }: { dados: { dia: string; entrada: number; saida: number; acumulado: number }[] }) {
  if (dados.length === 0) return null
  const W = 720, H = 240, PADX = 44, PADY = 24, PADB = 34
  const maxBar = Math.max(...dados.map((d) => Math.max(d.entrada, d.saida)), 1)
  const accs = dados.map((d) => d.acumulado)
  const accMax = Math.max(...accs, 0), accMin = Math.min(...accs, 0)
  const accRange = accMax - accMin || 1
  const innerW = W - PADX * 2, innerH = H - PADY - PADB
  const n = dados.length
  const slot = innerW / n
  const barW = Math.min(slot * 0.32, 16)
  const yBar = (v: number) => PADY + innerH * (1 - v / maxBar)
  const yAcc = (v: number) => PADY + innerH * (1 - (v - accMin) / accRange)
  const cx = (i: number) => PADX + slot * i + slot / 2
  const step = Math.ceil(n / 12)
  const accPath = dados.map((d, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${yAcc(d.acumulado).toFixed(1)}`).join(' ')

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm overflow-x-auto">
      <div className="mb-2 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />Entradas</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" />Saídas</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: '#1B6CA8' }} />Acumulado</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
        {[0, 0.5, 1].map((p) => {
          const y = PADY + innerH * (1 - p)
          return <g key={p}>
            <line x1={PADX} y1={y} x2={W - PADX} y2={y} stroke="#f1f5f9" />
            <text x={PADX - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmtK(maxBar * p)}</text>
          </g>
        })}
        {accMin < 0 && <line x1={PADX} y1={yAcc(0)} x2={W - PADX} y2={yAcc(0)} stroke="#e2e8f0" strokeDasharray="3 3" />}
        {dados.map((d, i) => (
          <g key={i}>
            <rect x={cx(i) - barW - 1} y={yBar(d.entrada)} width={barW} height={Math.max(0, PADY + innerH - yBar(d.entrada))} rx="2" fill="#22c55e" opacity="0.85" />
            <rect x={cx(i) + 1} y={yBar(d.saida)} width={barW} height={Math.max(0, PADY + innerH - yBar(d.saida))} rx="2" fill="#f87171" opacity="0.85" />
            {i % step === 0 && <text x={cx(i)} y={H - 12} textAnchor="middle" fontSize="9" fill="#94a3b8">{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</text>}
          </g>
        ))}
        <path d={accPath} fill="none" stroke="#1B6CA8" strokeWidth="2" />
        {dados.map((d, i) => <circle key={i} cx={cx(i)} cy={yAcc(d.acumulado)} r="2.5" fill="#1B6CA8" />)}
      </svg>
    </div>
  )
}

// ---------- Pareto (Curva ABC): barras + linha % acumulado ----------
export function ParetoChart({ dados }: { dados: { nome: string; valor: number; pctAcum: number; classe: string }[] }) {
  const top = dados.slice(0, 15)
  if (top.length === 0) return null
  const W = 720, H = 220, PADX = 40, PADY = 18, PADB = 20
  const maxV = Math.max(...top.map((d) => d.valor), 1)
  const innerW = W - PADX * 2, innerH = H - PADY - PADB
  const slot = innerW / top.length
  const barW = Math.min(slot * 0.6, 34)
  const yBar = (v: number) => PADY + innerH * (1 - v / maxV)
  const yPct = (p: number) => PADY + innerH * (1 - p / 100)
  const cx = (i: number) => PADX + slot * i + slot / 2
  const cor = (c: string) => c === 'A' ? '#22c55e' : c === 'B' ? '#eab308' : '#cbd5e1'
  const linha = top.map((d, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${yPct(d.pctAcum).toFixed(1)}`).join(' ')

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 420 }}>
        {[80, 95].map((p) => (
          <g key={p}>
            <line x1={PADX} y1={yPct(p)} x2={W - PADX} y2={yPct(p)} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={W - PADX + 2} y={yPct(p) + 3} fontSize="8" fill="#94a3b8">{p}%</text>
          </g>
        ))}
        {top.map((d, i) => (
          <g key={i}>
            <rect x={cx(i) - barW / 2} y={yBar(d.valor)} width={barW} height={Math.max(0, PADY + innerH - yBar(d.valor))} rx="2" fill={cor(d.classe)} />
          </g>
        ))}
        <path d={linha} fill="none" stroke="#1B6CA8" strokeWidth="2" />
        {top.map((d, i) => <circle key={i} cx={cx(i)} cy={yPct(d.pctAcum)} r="2.5" fill="#1B6CA8" />)}
      </svg>
      <p className="mt-1 text-center text-[11px] text-gray-400">Barras = faturamento (verde A · amarelo B · cinza C) · linha azul = % acumulado</p>
    </div>
  )
}

// ---------- Donut (composição, ex: DRE) ----------
export function Donut({ slices, centro, centroLabel }: { slices: { label: string; valor: number; cor: string }[]; centro: string; centroLabel: string }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.valor), 0) || 1
  const R = 70, r = 46, C = 90
  let ang = -Math.PI / 2
  const arcs = slices.map((s) => {
    const frac = Math.max(0, s.valor) / total
    const a0 = ang, a1 = ang + frac * Math.PI * 2
    ang = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (rad: number, a: number) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`
    const d = `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`
    return { d, cor: s.cor, frac }
  })
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 180 180" width="150" height="150">
        {arcs.map((a, i) => a.frac > 0 && <path key={i} d={a.d} fill={a.cor} />)}
        <text x="90" y="86" textAnchor="middle" fontSize="18" fontWeight="700" fill="#111827">{centro}</text>
        <text x="90" y="104" textAnchor="middle" fontSize="10" fill="#9ca3af">{centroLabel}</text>
      </svg>
      <div className="space-y-1.5">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.cor }} />
            <span className="text-gray-600">{s.label}</span>
            <span className="font-semibold text-gray-800">{brl(s.valor)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Barra inline (ranking) — magnitude relativa ----------
export function Barra({ frac, cor = '#1B6CA8' }: { frac: number; cor?: string }) {
  return (
    <div className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%`, background: cor }} />
    </div>
  )
}
