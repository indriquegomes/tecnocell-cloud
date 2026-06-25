'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { SessionGuard } from '@/components/SessionGuard'
import { BotaoReport } from '@/components/BotaoReport'

const PDV_PATHS = ['/painel/pdv', '/painel/pdv/operacao']

export function PainelShell({ children, email, nome, cargo }: { children: React.ReactNode; email: string; nome?: string; cargo?: string }) {
  const pathname = usePathname()
  const [aberta, setAberta] = useState(true)

  const isPDV = PDV_PATHS.some((p) => pathname === p)

  useEffect(() => {
    const salvo = localStorage.getItem('sidebar-aberta')
    if (salvo !== null) setAberta(salvo === 'true')
  }, [])

  const toggle = () => {
    setAberta((v) => {
      const novo = !v
      localStorage.setItem('sidebar-aberta', String(novo))
      return novo
    })
  }

  // Modo PDV — tela cheia, sem sidebar, sem header
  if (isPDV) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-gray-100">
        <SessionGuard />
        {/* Barra mínima do PDV */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">PDV</span>
            <span className="text-gray-200">|</span>
            <span className="text-xs text-gray-500">{nome ?? email}</span>
          </div>
          <Link
            href="/painel"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 transition"
          >
            ← Painel
          </Link>
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <SessionGuard />
      {aberta && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-label={aberta ? 'Recolher menu' : 'Expandir menu'}
              title={aberta ? 'Recolher menu' : 'Expandir menu'}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-sm font-medium text-gray-500">Painel Interno</h1>
          </div>
          <div className="flex items-center gap-4">
            <BotaoReport />
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">{nome ?? email}</p>
              {cargo && <p className="text-xs text-gray-400 capitalize">{cargo}</p>}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
