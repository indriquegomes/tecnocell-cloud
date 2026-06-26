'use client'

import { useState } from 'react'
import { criarPromocao } from './actions'

export function NovaPromocaoForm({ hoje }: { hoje: string }) {
  const [tipo, setTipo] = useState('valor_direto')

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-800">Nova Promoção</h3>
      <form action={criarPromocao} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Nome</label>
          <input name="nome" required className="field w-full" placeholder="Ex: Semana do Acessório" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Tipo</label>
          <select name="tipo" value={tipo} onChange={e => setTipo(e.target.value)} className="field w-full">
            <option value="valor_direto">Valor Direto (preço por produto)</option>
            <option value="leve_x_pague_y">Leve X, Pague Y</option>
            <option value="acima_x_pague_y">Acima de X unidades, Pague Y</option>
          </select>
        </div>

        {tipo === 'valor_direto' && (
          <div className="flex items-end">
            <p className="text-xs text-gray-400 pb-2">O preço é definido por produto na próxima tela.</p>
            <input name="valor" type="hidden" value="0" />
            <input name="quantidade_x" type="hidden" value="" />
            <input name="quantidade_y" type="hidden" value="" />
          </div>
        )}

        {tipo === 'leve_x_pague_y' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Leve (X unidades)</label>
              <input name="quantidade_x" type="number" min="1" defaultValue="3" required className="field w-full" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Pague (Y unidades)</label>
              <input name="quantidade_y" type="number" min="1" defaultValue="2" required className="field w-full" />
              <input name="valor" type="hidden" value="0" />
            </div>
          </>
        )}

        {tipo === 'acima_x_pague_y' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Acima de (X unidades)</label>
              <input name="quantidade_x" type="number" min="1" defaultValue="5" required className="field w-full" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Pague por unidade (R$)</label>
              <input name="valor" type="number" step="0.01" min="0" defaultValue="0" required className="field w-full" />
              <input name="quantidade_y" type="hidden" value="" />
            </div>
          </>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Início</label>
          <input name="data_inicio" type="date" defaultValue={hoje} required className="field w-full" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Fim</label>
          <input name="data_fim" type="date" required className="field w-full" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">Descrição (opcional)</label>
          <input name="descricao" className="field w-full" placeholder="Promoção de fim de mês..." />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button type="submit"
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition">
            + Criar e Adicionar Produtos →
          </button>
        </div>
      </form>
    </div>
  )
}
