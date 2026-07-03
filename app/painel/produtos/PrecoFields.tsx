'use client'

import { useState } from 'react'

const round2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function PrecoFields({ custoInicial = 0, vendaInicial = 0, minimoInicial = 0, podeCusto = true }: { custoInicial?: number; vendaInicial?: number; minimoInicial?: number; podeCusto?: boolean }) {
  if (!podeCusto) {
    return (
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço de Venda (R$)</label>
        <input name="preco" type="number" step="0.01" min="0" defaultValue={vendaInicial || ''} className="field" placeholder="0,00" />
        <p className="mt-1 text-[11px] text-gray-400">Seu cargo não tem acesso ao preço de custo.</p>
      </div>
    )
  }

  const margemInicial = custoInicial > 0 ? round2(((vendaInicial - custoInicial) / custoInicial) * 100) : 0
  const [custo, setCusto] = useState(custoInicial ? String(custoInicial) : '')
  const [margem, setMargem] = useState(margemInicial ? String(margemInicial) : '')
  const [venda, setVenda] = useState(vendaInicial ? String(vendaInicial) : '')

  const nc = parseFloat(custo) || 0
  const nv = parseFloat(venda) || 0
  const lucro = nv - nc

  function handleCusto(val: string) {
    setCusto(val)
    const c = parseFloat(val) || 0
    const m = parseFloat(margem) || 0
    if (c > 0 && margem.trim() !== '') setVenda(String(round2(c * (1 + m / 100))))
  }
  function handleMargem(val: string) {
    setMargem(val)
    const c = parseFloat(custo) || 0
    const m = parseFloat(val) || 0
    if (c > 0) setVenda(String(round2(c * (1 + m / 100))))
  }
  function handleVenda(val: string) {
    setVenda(val)
    const c = parseFloat(custo) || 0
    const v = parseFloat(val) || 0
    if (c > 0) setMargem(String(round2(((v - c) / c) * 100)))
  }

  return (
    <div className="sm:col-span-2 grid gap-5 sm:grid-cols-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço de Custo (R$)</label>
        <input name="preco_custo" type="number" step="0.01" min="0" value={custo}
          onChange={(e) => handleCusto(e.target.value)} className="field" placeholder="0,00" />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Margem (%)</label>
        <input type="number" step="0.01" value={margem}
          onChange={(e) => handleMargem(e.target.value)} className="field" placeholder="0" />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço de Venda (R$)</label>
        <input name="preco" type="number" step="0.01" min="0" value={venda}
          onChange={(e) => handleVenda(e.target.value)} className="field" placeholder="0,00" />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço Mínimo (R$)</label>
        <input name="preco_minimo" type="number" step="0.01" min="0" defaultValue={minimoInicial || ''} className="field" placeholder="0 = sem piso" />
        <p className="mt-1 text-[11px] text-gray-400">Piso de venda. Só quem tem a permissão &quot;Vender abaixo do mínimo&quot; fecha venda abaixo disso.</p>
      </div>
      <div className="text-sm self-end pb-2">
        {nc > 0 && nv > 0 ? (
          <span className={lucro >= 0 ? 'text-green-600' : 'text-red-600'}>
            Lucro: {fmt(lucro)}{nc > 0 ? ` (${round2((lucro / nc) * 100)}%)` : ''}
          </span>
        ) : (
          <span className="text-gray-400">Informe custo e margem — a venda é calculada sozinha.</span>
        )}
      </div>
    </div>
  )
}
