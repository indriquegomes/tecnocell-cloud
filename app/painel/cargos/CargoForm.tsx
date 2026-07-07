'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TODAS_PERMISSOES } from '@/lib/permissoes'
import { criarCargo, editarCargo } from './actions'
import { SubmitButton } from '@/components/SubmitButton'

export type CargoEdit = { id: string; nome: string; permissoes: string[]; is_master: boolean; ativo: boolean }

export function CargoForm({ editando }: { editando?: CargoEdit }) {
  const action = editando ? editarCargo.bind(null, editando.id) : criarCargo
  const [master, setMaster] = useState(editando?.is_master ?? false)
  const [sel, setSel] = useState<Set<string>>(new Set(editando?.permissoes ?? []))

  const toggle = (k: string) => setSel((prev) => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n
  })

  return (
    <form action={action} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
      <h3 className="text-sm font-semibold text-gray-700">{editando ? `Editando cargo: ${editando.nome}` : 'Novo Cargo'}</h3>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-56">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome do cargo *</label>
          <input name="nome" required defaultValue={editando?.nome ?? ''} className="field" placeholder="Ex: Vendedora, Gerente, Estoquista" />
        </div>
        {editando && (
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 pb-2">
            <input type="hidden" name="ativo" value="0" />
            <input type="checkbox" name="ativo" value="1" defaultChecked={editando.ativo} className="h-4 w-4 rounded" />
            Cargo ativo
          </label>
        )}
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-purple-800">Acesso total (Master)</p>
          <p className="text-xs text-purple-500">Ignora todas as restrições (dono/gerente)</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="hidden" name="is_master" value="0" />
          <input type="checkbox" name="is_master" value="1" checked={master} onChange={(e) => setMaster(e.target.checked)} className="h-4 w-4 rounded accent-purple-600" />
          <span className={`text-xs font-bold ${master ? 'text-purple-600' : 'text-gray-400'}`}>{master ? 'ON' : 'OFF'}</span>
        </div>
      </label>

      {!master && (['Módulos', 'Limites'] as const).map((grupo) => (
        <div key={grupo}>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {grupo === 'Módulos' ? 'Módulos que o cargo acessa' : 'Limites de operação (o que pode fazer)'}
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TODAS_PERMISSOES.filter((p) => p.grupo === grupo).map((p) => {
              const on = sel.has(p.key)
              return (
                <label key={p.key} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 transition ${on ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                  <div className="min-w-0 pr-2">
                    <p className={`truncate text-xs font-semibold ${on ? 'text-blue-700' : 'text-gray-600'}`}>{p.label}</p>
                    <p className="truncate text-[10px] text-gray-400">{p.desc}</p>
                  </div>
                  <input type="checkbox" name="permissoes" value={p.key} checked={on} onChange={() => toggle(p.key)} className="h-4 w-4 shrink-0 rounded accent-blue-600" />
                </label>
              )
            })}
          </div>
        </div>
      ))}

      <div className="flex gap-3 pt-1">
        <SubmitButton pendingText={editando ? 'Salvando...' : 'Criando...'} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
          {editando ? 'Salvar cargo' : 'Criar cargo'}
        </SubmitButton>
        {editando && <Link href="/painel/cargos" className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancelar</Link>}
      </div>
    </form>
  )
}
