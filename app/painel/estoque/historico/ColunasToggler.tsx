'use client'

import { useState, useEffect, useRef } from 'react'

const COLUNAS = [
  { key: 'data',      label: 'Data',              padrao: true },
  { key: 'tipo',      label: 'Movimentação',       padrao: true },
  { key: 'produto',   label: 'Produto',            padrao: true },
  { key: 'deposito',  label: 'Depósito',           padrao: true },
  { key: 'cliente',   label: 'Cliente/Fornecedor', padrao: true },
  { key: 'qtd',       label: 'Quantidade',         padrao: true },
  { key: 'vlr_unit',  label: 'Valor Unitário',     padrao: true },
  { key: 'vlr_total', label: 'Valor Total',        padrao: true },
  { key: 'obs',       label: 'Observações',        padrao: true },
]

const LS_KEY = 'mov_colunas'

function loadPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  const d: Record<string, boolean> = {}
  COLUNAS.forEach((c) => (d[c.key] = c.padrao))
  return d
}

export function ColunasToggler() {
  const [visiveis, setVisiveis] = useState<Record<string, boolean>>(() => {
    const d: Record<string, boolean> = {}
    COLUNAS.forEach((c) => (d[c.key] = c.padrao))
    return d
  })
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setVisiveis(loadPrefs())
  }, [])

  useEffect(() => {
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  function toggle(key: string) {
    setVisiveis((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const estiloOculto = COLUNAS.filter((c) => !visiveis[c.key])
    .map((c) => `[data-col="${c.key}"] { display: none !important; }`)
    .join('\n')

  return (
    <div className="relative" ref={ref}>
      <style>{estiloOculto}</style>
      <button
        onClick={() => setAberto((v) => !v)}
        title="Configurar colunas"
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition flex items-center gap-1.5"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        Colunas
      </button>

      {aberto && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-gray-200 bg-white shadow-lg py-2">
          <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Colunas visíveis
          </p>
          {COLUNAS.map((c) => (
            <label key={c.key}
              className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={!!visiveis[c.key]}
                onChange={() => toggle(c.key)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
