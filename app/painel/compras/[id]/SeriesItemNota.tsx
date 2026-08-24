'use client'

import { useState } from 'react'
import { salvarSeriesItem } from '../actions'

// Captura de IMEI um a um (digitado ou leitor de código de barras — o leitor
// só "digita rápido e aperta Enter", então funciona igual). Salva a lista
// inteira a cada mudança; simples e já cobre o volume de uma nota normal.
export function SeriesItemNota({
  itemId, notaId, quantidade, seriesIniciais,
}: {
  itemId: string
  notaId: string
  quantidade: number
  seriesIniciais: string[]
}) {
  const [series, setSeries] = useState<string[]>(seriesIniciais)
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const salvar = async (novaLista: string[]) => {
    setSalvando(true); setErro('')
    const r = await salvarSeriesItem(itemId, notaId, novaLista)
    if (!r.ok) setErro(r.erro ?? 'Erro ao salvar.')
    else setSeries(novaLista)
    setSalvando(false)
  }

  const adicionar = () => {
    const imei = valor.trim()
    if (!imei) return
    if (series.includes(imei)) { setErro('Este IMEI já foi cadastrado nesta nota.'); return }
    setValor('')
    void salvar([...series, imei])
  }

  const remover = (imei: string) => void salvar(series.filter((s) => s !== imei))

  const completo = series.length === quantidade

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase">IMEIs</span>
        <span className={`text-xs font-semibold ${completo ? 'text-green-600' : 'text-amber-600'}`}>
          {series.length} de {quantidade}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
          placeholder="Digite ou leia o IMEI e aperte Enter"
          disabled={salvando}
          className="field flex-1 text-sm"
        />
        <button type="button" onClick={adicionar} disabled={salvando || !valor.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
          Adicionar
        </button>
      </div>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
      {series.length > 0 && (
        <ul className="mt-2 space-y-1">
          {series.map((s) => (
            <li key={s} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1 text-sm">
              <span className="font-mono text-gray-700">{s}</span>
              <button type="button" onClick={() => remover(s)} disabled={salvando}
                className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50">
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
