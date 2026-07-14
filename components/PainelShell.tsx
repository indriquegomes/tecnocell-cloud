'use client'

import { useState, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { SessionGuard } from '@/components/SessionGuard'
import { BotaoReport } from '@/components/BotaoReport'
import { BarraAvisos } from '@/components/BarraAvisos'
import type { Lembrete as AvisoCaixa } from '@/lib/lembrete-caixa'
import type { LembretePendente } from '@/lib/lembretes'

const PDV_PATHS = ['/painel/pdv', '/painel/pdv/operacao']

export function PainelShell({
  children, email, nome, permissoes, isMaster, avisosCaixa = [], rotinas = [],
}: {
  children: React.ReactNode
  email: string
  nome?: string
  permissoes: string[]
  isMaster: boolean
  avisosCaixa?: AvisoCaixa[]
  rotinas?: LembretePendente[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [aberta, setAberta] = useState(true)
  const [acessoNegado, setAcessoNegado] = useState(false)

  const isPDV = PDV_PATHS.some((p) => pathname === p)

  // No celular a sidebar COMEÇA FECHADA: ela é fixa de 240px e, numa tela de 390px,
  // sobrava uma tira de 150px pro conteúdo — o painel ficava inutilizável no telefone.
  // No PC/tablet mantém a preferência salva (o Vitor gosta de recolher).
  useEffect(() => {
    const celular = window.matchMedia('(max-width: 1023px)').matches
    if (celular) { setAberta(false); return }
    const salvo = localStorage.getItem('sidebar-aberta')
    if (salvo !== null) setAberta(salvo === 'true')
  }, [])

  useEffect(() => {
    if (searchParams.get('acesso') === 'negado') {
      setAcessoNegado(true)
      setTimeout(() => setAcessoNegado(false), 4000)
    }
  }, [searchParams])

  const toggle = () => {
    setAberta((v) => {
      const novo = !v
      localStorage.setItem('sidebar-aberta', String(novo))
      return novo
    })
  }

  if (isPDV) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-gray-100">
        <SessionGuard />
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">PDV</span>
            <span className="text-gray-200">|</span>
            <span className="text-xs text-gray-500">{nome ?? email}</span>
          </div>
          <Link href="/painel"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 transition">
            ← Painel
          </Link>
        </div>
        <BarraAvisos caixas={avisosCaixa} rotinas={rotinas} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <SessionGuard />

      {/* Toast acesso negado */}
      {acessoNegado && (
        <div className="fixed top-5 right-5 z-[60] rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          🚫 Você não tem permissão para acessar essa página.
        </div>
      )}

      {/* Celular: sidebar vira gaveta por cima do conteúdo (fixed + fundo escuro).
          PC/tablet: continua empurrando o conteúdo, como sempre foi. */}
      {aberta && (
        <>
          <div
            onClick={toggle}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:static lg:z-auto">
            <Sidebar permissoes={permissoes} isMaster={isMaster} />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={toggle}
              aria-label={aberta ? 'Recolher menu' : 'Expandir menu'}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition">
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
              <p className="text-xs text-gray-400">{isMaster ? 'Master' : 'Operador'}</p>
            </div>
          </div>
        </header>
        <BarraAvisos caixas={avisosCaixa} rotinas={rotinas} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
