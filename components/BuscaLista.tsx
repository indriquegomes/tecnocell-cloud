'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabaseBrowser = createClient()

export type Sugestao = { label: string; value: string }

// REGRA DO SISTEMA: busca de lista padrão — instantânea (debounce 350ms, sem
// Enter), preserva os outros filtros e volta pra página 1. O acento/multi-palavra
// é resolvido no lado do servidor (busca_norm/nome_norm + ilike por palavra).
// Toda lista nova deve usar este componente.
//
// `sugestoes` (opcional): função que devolve {label,value} pra mostrar um dropdown
// de autocomplete enquanto digita (ex.: nomes de cliente/fornecedor). Se omitida,
// o campo funciona como antes (busca simples).
export function BuscaLista({
  basePath,
  placeholder = 'Buscar...',
  className,
  sugestoes,
}: {
  basePath: string
  placeholder?: string
  className?: string
  sugestoes?: (accessToken: string, termo: string) => Promise<Sugestao[]>
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [v, setV] = useState(sp.get('busca') ?? '')
  const first = useRef(true)
  const ref = useRef<HTMLDivElement>(null)
  const [opcoes, setOpcoes] = useState<Sugestao[]>([])
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const digitou = useRef(false)

  // busca instantânea (comportamento original)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const id = setTimeout(() => {
      const params = new URLSearchParams(Array.from(sp.entries()))
      const val = v.trim()
      if (val) params.set('busca', val)
      else params.delete('busca')
      params.delete('pagina')
      const qs = params.toString()
      router.replace(basePath + (qs ? '?' + qs : ''))
    }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v])

  // sugestões (opcional)
  useEffect(() => {
    if (!sugestoes) return
    if (!digitou.current) return
    const termo = v.trim()
    if (!termo) { setOpcoes([]); setBuscando(false); setAberto(false); return }
    setBuscando(true)
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const { data } = await supabaseBrowser.auth.getSession()
        const res = await sugestoes(data.session?.access_token ?? '', termo)
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
        value={v}
        onChange={(e) => { digitou.current = true; setV(e.target.value) }}
        onFocus={() => opcoes.length && setAberto(true)}
        placeholder={placeholder}
        autoFocus
        autoComplete="off"
        className={className ?? 'min-w-[280px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'}
      />
      {sugestoes && aberto && v.trim().length >= 1 && (
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
