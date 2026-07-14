'use client'

import type { Motivo } from '@/lib/motivos'

// A resposta pra "por que as peças voltam?".
//
// O motivo era texto livre e as 6 devoluções existentes tinham motivo NULL — ninguém
// preenchia, e o que fosse preenchido não daria pra somar. Fechado, dá pra CONTAR.
//
// Cada barra é um filtro: clica e a lista abaixo mostra só aquele motivo.
export function ResumoMotivos({
  titulo,
  motivos,
  contagem,
  selecionado,
  onSelecionar,
  legenda,
}: {
  titulo: string
  motivos: Motivo[]
  contagem: Record<string, { n: number; valor: number }>
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  legenda?: string
}) {
  const total = Object.values(contagem).reduce((s, x) => s + x.n, 0)
  const semMotivo = contagem['__sem__']?.n ?? 0

  if (total === 0) return null

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const linhas = motivos
    .map((m) => ({ m, ...(contagem[m.id] ?? { n: 0, valor: 0 }) }))
    .filter((l) => l.n > 0)
    .sort((a, b) => b.n - a.n)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">{titulo}</p>
        {selecionado && (
          <button
            type="button"
            onClick={() => onSelecionar(null)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            limpar filtro ✕
          </button>
        )}
      </div>

      <div className="space-y-2">
        {linhas.map(({ m, n, valor }) => {
          const pct = (n / total) * 100
          const ativo = selecionado === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelecionar(ativo ? null : m.id)}
              className={`block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-gray-50 ${ativo ? 'bg-gray-50 ring-1 ring-gray-200' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className={ativo ? 'font-semibold text-gray-900' : 'text-gray-600'}>
                  {m.icone} {m.label}
                </span>
                <span className="shrink-0 tabular-nums text-gray-400">
                  <b className="text-gray-800">{n}</b> · {pct.toFixed(0)}% · {fmt(valor)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${m.cor.split(' ').find((c) => c.startsWith('bg-'))?.replace('-50', '-400') ?? 'bg-gray-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {semMotivo > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          {semMotivo} sem motivo registrado (antes do campo virar obrigatório).
        </p>
      )}
      {legenda && <p className="mt-2 text-[11px] text-gray-400">{legenda}</p>}
    </div>
  )
}
