'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// Busca instantânea de produtos (debounce) — sem Enter, sem acento, multi-palavra
// (bate em produtos.busca_norm = nome+código+marca). Preserva os outros filtros.
export function BuscaProdutos() {
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
      params.delete('pagina') // nova busca volta pra página 1
      const qs = params.toString()
      router.replace('/painel/produtos' + (qs ? '?' + qs : ''))
    }, 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v])

  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      placeholder="Buscar por nome, código ou marca..."
      autoFocus
      className="min-w-[280px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}
