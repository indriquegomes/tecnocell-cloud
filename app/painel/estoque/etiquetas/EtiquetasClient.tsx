'use client'

import { useState, useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { formatBRL } from '@/lib/utils'

type Produto = { id: string; nome: string; codigo: string | null; ean: string | null; preco: number }
type ItemFila = { produto_id: string; nome: string; preco: number; code: string; quantidade: number }

function acharProduto(produtos: Produto[], busca: string): Produto | null {
  const alvo = busca.trim().toLowerCase()
  if (!alvo) return null
  const semCodigo = alvo.replace(/\s*\([^)]*\)$/, '').trim()
  return (
    produtos.find(p => (p.nome + (p.codigo ? ` (${p.codigo})` : '')).toLowerCase() === alvo) ??
    produtos.find(p => p.nome.toLowerCase() === semCodigo) ??
    produtos.find(p => p.nome.toLowerCase().startsWith(semCodigo)) ??
    null
  )
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, { format: 'CODE128', width: 1.4, height: 34, fontSize: 11, margin: 0, displayValue: true })
      } catch { /* código inválido p/ o formato — ignora */ }
    }
  }, [value])
  return <svg ref={ref} className="w-full" />
}

export function EtiquetasClient({ produtos }: { produtos: Produto[] }) {
  const [fila, setFila] = useState<ItemFila[]>([])
  const [busca, setBusca] = useState('')

  const match = acharProduto(produtos, busca)

  function adicionar() {
    if (!match) return
    const code = (match.ean || match.codigo || '').trim()
    setFila(prev => {
      const ex = prev.find(i => i.produto_id === match.id)
      if (ex) return prev.map(i => i.produto_id === match.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { produto_id: match.id, nome: match.nome, preco: match.preco, code, quantidade: 1 }]
    })
    setBusca('')
  }

  const setQtd = (id: string, q: number) =>
    setFila(prev => prev.map(i => i.produto_id === id ? { ...i, quantidade: Math.max(1, q) } : i))
  const remover = (id: string) => setFila(prev => prev.filter(i => i.produto_id !== id))

  const etiquetas = fila.flatMap(i => Array.from({ length: i.quantidade }, () => i))
  const totalEtiquetas = etiquetas.length

  return (
    <div className="space-y-5">
      <style>{`
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          .etiquetas-area { display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 0; }
          .etiqueta { break-inside: avoid; border: 1px dashed #ccc; }
          @page { margin: 8mm; }
        }
      `}</style>

      {/* Controles */}
      <div className="no-print space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-2 max-w-xl">
          <input
            list="etiq-produtos"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
            placeholder="Pesquise o produto e Enter"
            className="field"
            autoComplete="off"
          />
          <datalist id="etiq-produtos">
            {produtos.map(p => <option key={p.id} value={p.nome + (p.codigo ? ` (${p.codigo})` : '')} />)}
          </datalist>
          <button type="button" onClick={adicionar} disabled={!match}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition whitespace-nowrap">
            + Adicionar
          </button>
        </div>

        {fila.length > 0 && (
          <div className="rounded-xl border border-gray-200 overflow-hidden max-w-xl">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase w-28">Etiquetas</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {fila.map(i => (
                  <tr key={i.produto_id}>
                    <td className="px-4 py-2 text-sm text-gray-800">
                      {i.nome}
                      {!i.code && <span className="ml-1 text-xs text-amber-600">(sem código)</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input type="number" min="1" value={i.quantidade}
                        onChange={e => setQtd(i.produto_id, parseInt(e.target.value, 10) || 1)}
                        className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-center text-sm" />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button type="button" onClick={() => remover(i.produto_id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalEtiquetas > 0 && (
          <button type="button" onClick={() => window.print()}
            className="rounded-lg bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 transition">
            🖨️ Imprimir {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {/* Área de etiquetas (preview + impressão) */}
      {totalEtiquetas > 0 && (
        <div className="etiquetas-area grid grid-cols-3 gap-2">
          {etiquetas.map((e, idx) => (
            <div key={idx} className="etiqueta flex flex-col items-center justify-center gap-1 rounded border border-gray-200 bg-white p-2 text-center">
              <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2">{e.nome}</p>
              <p className="text-sm font-bold text-gray-900">{formatBRL(e.preco)}</p>
              {e.code ? <Barcode value={e.code} /> : <p className="text-[10px] text-gray-400">sem código de barras</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
