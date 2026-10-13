'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { formatBRL } from '@/lib/utils'

type Item = { id: string; codigo: string | null; nome: string; preco: number }

const Ctx = createContext<{ selecionados: Set<string>; toggle: (id: string) => void }>({ selecionados: new Set(), toggle: () => {} })

// Marca vários itens e copia todos de uma vez no formato "código - nome — R$ preço".
export function CopiarMultiplos({ itens, children }: { itens: Item[]; children: ReactNode }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [copiado, setCopiado] = useState(false)

  const toggle = (id: string) => setSelecionados(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const copiar = async () => {
    const txt = itens
      .filter(i => selecionados.has(i.id))
      .map(i => `${i.codigo ? i.codigo + ' - ' : ''}${i.nome} — ${formatBRL(i.preco)}`)
      .join('\n')
    if (!txt) return
    try {
      await navigator.clipboard.writeText(txt)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* clipboard bloqueado */ }
  }

  return (
    <Ctx.Provider value={{ selecionados, toggle }}>
      {children}
      <button
        type="button"
        onClick={copiar}
        className="fixed bottom-5 right-5 z-30 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-700"
      >
        {copiado
          ? '✓ Copiado!'
          : selecionados.size > 0
            ? `📋 Copiar ${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''}`
            : '📋 Selecione os itens'}
      </button>
    </Ctx.Provider>
  )
}

export function CheckboxCopiar({ id }: { id: string }) {
  const { selecionados, toggle } = useContext(Ctx)
  return (
    <input
      type="checkbox"
      checked={selecionados.has(id)}
      onChange={() => toggle(id)}
      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
    />
  )
}
