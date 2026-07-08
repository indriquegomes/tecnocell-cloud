'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// REGRA DO SISTEMA: busca de lista padrão — instantânea (debounce 350ms, sem
// Enter), preserva os outros filtros e volta pra página 1. O acento/multi-palavra
// é resolvido no lado do servidor (busca_norm/nome_norm + ilike por palavra).
// Toda lista nova deve usar este componente.
export function BuscaLista({
  basePath,
  placeholder = 'Buscar...',
  className,
}: {
  basePath: string
  placeholder?: string
  className?: string
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [v, setV] = useState(sp.get('busca') ?? '')
  const first = useRef(true)

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

  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      placeholder={placeholder}
      autoFocus
      className={className ?? 'min-w-[280px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'}
    />
  )
}
