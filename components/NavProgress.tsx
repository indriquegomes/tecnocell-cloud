'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Barra de progresso fina no topo durante a navegação (sensação de rapidez).
// O App Router não expõe evento de "início de navegação", então detectamos o
// clique num link interno (começo) e o usePathname (fim, quando a rota troca).
// CSS puro, sem dependência. Respeita prefers-reduced-motion via transições curtas.
export function NavProgress() {
  const pathname = usePathname()
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const active = useRef(false)
  const timers = useRef<number[]>([])

  const clear = () => { timers.current.forEach((t) => clearTimeout(t)); timers.current = [] }
  const push = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }

  // Começa ao clicar num link interno pra outra rota
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      let url: URL
      try { url = new URL(a.href, location.href) } catch { return }
      if (url.origin !== location.origin || url.pathname === location.pathname) return
      active.current = true
      clear(); setVisible(true); setWidth(8)
      push(() => setWidth(50), 50)
      push(() => setWidth(78), 300)
      push(() => setWidth(92), 900)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Termina quando a rota realmente troca
  useEffect(() => {
    if (!active.current) return
    active.current = false
    clear(); setWidth(100)
    push(() => setVisible(false), 250)
    push(() => setWidth(0), 550)
    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.35s ease' }}
    >
      <div
        className="h-full bg-[#1B6CA8]"
        style={{ width: `${width}%`, boxShadow: '0 0 8px rgba(27,108,168,0.55)', transition: 'width 0.35s ease' }}
      />
    </div>
  )
}
