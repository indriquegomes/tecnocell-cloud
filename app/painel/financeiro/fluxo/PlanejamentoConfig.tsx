'use client'

import { salvarPlanejamento } from './actions'

export function PlanejamentoConfig({ categorias, margem }: { categorias: string[]; margem: number }) {
  return (
    <form action={salvarPlanejamento} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-gray-700">Categorias fixas (todo mês)</p>
      <p className="mt-0.5 text-xs text-gray-400">Separe por vírgula. Adicione ou remova quando quiser.</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <input name="categorias" defaultValue={categorias.join(', ')} className="field w-full text-sm" />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs text-gray-500">Margem %</label>
          <input name="margem" type="number" min="0" max="100" step="0.5" defaultValue={margem} className="field w-full text-sm" />
        </div>
        <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
          Salvar
        </button>
      </div>
    </form>
  )
}
