'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/Spinner'
import { salvarTabelasPromo } from '../actions'

// Isa: promoção só valer em certas tabelas de preço (ex.: ATACADO1/ATACADO2).
// NENHUMA marcada = vale em TODAS as tabelas (inclusive Preço Padrão).
export function TabelasPromo({
  promocaoId,
  tabelas,
  selecionadas,
}: {
  promocaoId: string
  tabelas: { id: string; nome: string }[]
  selecionadas: string[]
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(selecionadas))
  const [msg, setMsg] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const toggle = (id: string) => {
    setMsg(null)
    setSel((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const salvar = () => {
    startTransition(async () => {
      await salvarTabelasPromo(promocaoId, [...sel])
      setMsg(sel.size === 0 ? 'Salvo: vale em todas as tabelas.' : `Salvo: restrita a ${sel.size} tabela${sel.size > 1 ? 's' : ''}.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-800">Aplicar só em certas tabelas</h3>
        <p className="mt-0.5 text-xs text-gray-400">
          Marque as tabelas de preço em que esta promoção vale. <b>Nenhuma marcada = vale em todas</b> (inclusive Preço Padrão).
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {tabelas.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={sel.has(t.id)}
              onChange={() => toggle(t.id)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            {t.nome}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pendente}
          onClick={salvar}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50"
        >
          {pendente && <Spinner className="h-3.5 w-3.5" />}
          {pendente ? 'Salvando...' : 'Salvar tabelas'}
        </button>
        {msg && <p className="text-sm font-medium text-green-600">✓ {msg}</p>}
      </div>
    </div>
  )
}
