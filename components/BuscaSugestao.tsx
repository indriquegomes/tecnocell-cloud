'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabaseBrowser = createClient()

export type OpcaoSugestao = { label: string; value: string }

// Autocomplete de filtro — digita e mostra sugestões em cascata abaixo (debounce
// 300ms, busca sob demanda via server action). O valor escolhido preenche o campo
// (que é um <input name=...> do form GET), preservando o resto dos filtros.
export function BuscaSugestao({
  name,
  defaultValue,
  placeholder,
  buscar,
  className,
}: {
  name: string
  defaultValue?: string
  placeholder?: string
  buscar: (accessToken: string, termo: string) => Promise<OpcaoSugestao[]>
  className?: string
}) {
  const [v, setV] = useState(defaultValue ?? '')
  const [opcoes, setOpcoes] = useState<OpcaoSugestao[]>([])
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const digitou = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!digitou.current) return
    const termo = v.trim()
    if (!termo) { setOpcoes([]); setBuscando(false); return }
    setBuscando(true)
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const { data } = await supabaseBrowser.auth.getSession()
        const res = await buscar(data.session?.access_token ?? '', termo)
        if (vivo) { setOpcoes(res); setAberto(true) }
      } catch { if (vivo) setOpcoes([]) }
      finally { if (vivo) setBuscando(false) }
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v])

  useEffect(() => {
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        name={name}
        value={v}
        onChange={(e) => { digitou.current = true; setV(e.target.value) }}
        onFocus={() => opcoes.length && setAberto(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className ?? 'w-52 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'}
      />
      {aberto && v.trim().length >= 1 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full min-w-[20rem] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {buscando && opcoes.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">Buscando…</li>
          ) : opcoes.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">Nenhum resultado.</li>
          ) : opcoes.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); digitou.current = false; setV(o.value); setAberto(false) }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-blue-50 transition"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
