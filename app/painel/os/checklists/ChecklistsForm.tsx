'use client'

import { useState } from 'react'
import Link from 'next/link'
import { criarChecklist, editarChecklist } from './actions'
import { SubmitButton } from '@/components/SubmitButton'

export function ChecklistsForm({ editando }: { editando?: { id: string; nome: string; itens: string[] } }) {
  const [itens, setItens] = useState<string[]>(editando?.itens.length ? editando.itens : [''])
  const action = editando ? editarChecklist.bind(null, editando.id) : criarChecklist

  return (
    <form action={action} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">{editando ? `Editando: ${editando.nome}` : 'Novo check-list'}</h3>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-600">Nome do check-list *</label>
        <input name="nome" required defaultValue={editando?.nome ?? ''} className="field"
          placeholder="Ex: Entrada de celular, Saída pós-reparo" />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-600">Itens de verificação</label>
        <div className="space-y-2">
          {itens.map((it, i) => (
            <div key={i} className="flex gap-2">
              <input name="item" value={it}
                onChange={(e) => setItens(itens.map((x, xi) => (xi === i ? e.target.value : x)))}
                className="field flex-1" placeholder={`Item ${i + 1} (ex: Tela sem trincos? Liga? Botões OK?)`} />
              <button type="button" onClick={() => setItens(itens.filter((_, x) => x !== i))}
                className="rounded-lg border border-gray-200 px-3 text-sm text-gray-400 hover:bg-gray-50 transition">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItens([...itens, ''])}
          className="mt-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition">
          + Adicionar item
        </button>
      </div>

      <div className="flex gap-3 border-t border-gray-100 pt-4">
        <SubmitButton pendingText={editando ? 'Salvando...' : 'Criando...'}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
          {editando ? 'Salvar' : 'Criar check-list'}
        </SubmitButton>
        {editando && (
          <Link href="/painel/os/checklists" className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  )
}
