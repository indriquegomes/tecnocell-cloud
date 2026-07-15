'use client'

import { useState, useEffect, useRef } from 'react'

// Botão "Colunas" que liga/desliga a coluna de estoque de cada depósito na lista
// de Produtos. O Vitor: "sistema de coluna — eu seleciono a coluna que quero
// colocar ou não". A escolha fica salva no navegador dele (localStorage).
//
// Como funciona sem "piscar": o servidor já renderiza TODAS as colunas de depósito
// (data-col-dep="<id>"). Este componente injeta um <style> que ESCONDE as que o
// usuário desmarcou. Default = todas visíveis, então na primeira vez ele já vê os
// depósitos de cara — e desliga o que não quer.

const CHAVE = 'produtos-colunas-dep-ocultas'

export function ColunasDeposito({ depositos }: { depositos: { id: string; nome: string }[] }) {
  const [ocultas, setOcultas] = useState<string[]>([])
  const [carregado, setCarregado] = useState(false)
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { setOcultas(JSON.parse(localStorage.getItem(CHAVE) ?? '[]')) } catch { /* ignora */ }
    setCarregado(true)
  }, [])

  // fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const toggle = (id: string) => {
    setOcultas((prev) => {
      const novo = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      localStorage.setItem(CHAVE, JSON.stringify(novo))
      return novo
    })
  }

  const visiveis = depositos.length - ocultas.length

  return (
    <div className="relative" ref={ref}>
      {/* esconde no navegador as colunas desmarcadas — só depois de carregar, pra não piscar */}
      {carregado && ocultas.length > 0 && (
        <style>{ocultas.map((id) => `[data-col-dep="${id}"]{display:none}`).join('')}</style>
      )}
      <button type="button" onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Colunas
        <span className="rounded-full bg-blue-100 px-1.5 text-xs font-semibold text-blue-700">{visiveis}</span>
        <svg className={`h-3.5 w-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {aberto && (
        <div className="animate-pop-in absolute right-0 z-30 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Estoque por depósito</p>
          {depositos.map((d) => {
            const on = !ocultas.includes(d.id)
            return (
              <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                <input type="checkbox" checked={on} onChange={() => toggle(d.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                {d.nome}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
