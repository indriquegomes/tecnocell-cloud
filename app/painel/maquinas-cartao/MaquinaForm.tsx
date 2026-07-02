'use client'

import { useState } from 'react'
import Link from 'next/link'
import { criarMaquina, editarMaquina } from './actions'

type Maquina = {
  id: string
  nome: string
  taxa_debito: number
  taxas_credito: number[]
  max_parcelas: number
  ativo: boolean
}

export function MaquinaForm({ maquina }: { maquina?: Maquina }) {
  const editando = !!maquina
  const [nome, setNome] = useState(maquina?.nome ?? '')
  const [taxaDebito, setTaxaDebito] = useState(String(maquina?.taxa_debito ?? 0))
  const [maxParcelas, setMaxParcelas] = useState(maquina?.max_parcelas ?? 10)
  const [ativo, setAtivo] = useState(maquina?.ativo ?? true)
  const [taxas, setTaxas] = useState<number[]>(() =>
    Array.from({ length: maquina?.max_parcelas ?? 10 }, (_, i) => maquina?.taxas_credito?.[i] ?? 0),
  )

  function mudarMax(v: number) {
    const n = Math.max(1, Math.min(24, v || 1))
    setMaxParcelas(n)
    setTaxas((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? 0))
  }
  function setTaxa(i: number, v: string) {
    setTaxas((prev) => prev.map((t, j) => (j === i ? (parseFloat(v) || 0) : t)))
  }

  const action = editando ? editarMaquina.bind(null, maquina!.id) : criarMaquina

  return (
    <form action={action} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
      <h3 className="text-sm font-semibold text-gray-700">{editando ? `Editando: ${maquina!.nome}` : 'Nova Máquina'}</h3>

      <div className="grid gap-4 sm:grid-cols-[1fr_140px_140px]">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Nome *</label>
          <input name="nome" required value={nome} onChange={(e) => setNome(e.target.value)} className="field" placeholder="Ex: TON" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Taxa débito (%)</label>
          <input name="taxa_debito" type="number" step="0.01" min="0" value={taxaDebito} onChange={(e) => setTaxaDebito(e.target.value)} className="field text-center" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">Máx. parcelas</label>
          <input name="max_parcelas" type="number" min="1" max="24" value={maxParcelas} onChange={(e) => mudarMax(parseInt(e.target.value, 10))} className="field text-center" />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-gray-600">Taxas de crédito por parcela (%)</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {taxas.map((t, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5">
              <span className="w-8 shrink-0 text-xs font-semibold text-gray-500">{i + 1}x</span>
              <input type="number" step="0.01" min="0" value={t}
                onChange={(e) => setTaxa(i, e.target.value)}
                className="w-full rounded border-0 p-0 text-sm text-center focus:outline-none focus:ring-0" />
              <span className="text-xs text-gray-400">%</span>
            </div>
          ))}
        </div>
      </div>

      {editando && (
        <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
          <input type="hidden" name="ativo" value={String(ativo)} />
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded" />
          Máquina ativa
        </label>
      )}

      <input type="hidden" name="taxas_credito" value={JSON.stringify(taxas)} />

      <div className="flex gap-3 pt-1">
        <button type="submit" className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          {editando ? 'Salvar' : 'Adicionar'}
        </button>
        {editando && (
          <Link href="/painel/maquinas-cartao" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  )
}
