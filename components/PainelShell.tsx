'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { SessionGuard } from '@/components/SessionGuard'
import { BotaoReport } from '@/components/BotaoReport'

export function PainelShell({ children, email }: { children: React.ReactNode; email: string }) {
  const [aberta, setAberta] = useState(true)

  // Restaura a preferência salva (recolhida ou não)
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
            <span className="text-sm text-gray-500">{email}</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
