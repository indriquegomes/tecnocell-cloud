'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// Busca instantânea de estoque (debounce) — bate no servidor, acha em TODO o
// estoque (não só na página atual). Sem acento, via produtos.busca_norm.
export function BuscaEstoque() {
  const router = useRouter()
  const sp = useSearchParams()
  const [v, setV] = useState(sp.get('busca') ?? '')
  const first = useRef(true)

  const buscar = (texto: string) => {
    const params = new URLSearchParams(Array.from(sp.entries()))
    const val = texto.trim()
    if (val) params.set('busca', val)
    else params.delete('busca')
    params.delete('pagina') // nova busca volta pra página 1
    const qs = params.toString()
    router.replace('/painel/estoque' + (qs ? '?' + qs : ''))
  }

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const id = setTimeout(() => buscar(v), 350)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v])

  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      // Enter busca NA HORA (sem esperar o debounce e sem clicar em Filtrar) — pedido do Vitor
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(v) } }}
      placeholder="Buscar produto... (Enter)"
      autoFocus
      className="min-w-[280px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}
