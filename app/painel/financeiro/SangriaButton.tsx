'use client'

import { useState } from 'react'
import { registrarSangria } from './actions'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { SubmitButton } from '@/components/SubmitButton'

// Sangria / Retirada em 1 clique — tira dinheiro de um caixa (vira lançamento pago).
export function SangriaButton({ contas }: { contas: { id: string; nome: string; tipo: string }[] }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className="rounded-lg bg-[#b42318] px-3.5 py-2 text-sm font-semibold text-white hover:brightness-95 transition">− Sangria / Retirada</button>
      {aberto && (
        <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setAberto(false) }}>
          <div className="animate-pop-in w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-bold text-gray-900">Sangria / Retirada</h3>
            <p className="mb-4 text-sm text-gray-500">Tirar dinheiro de um caixa. Registra a saída e baixa o saldo.</p>
            <form action={registrarSangria} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Caixa</label>
                <select name="conta_id" required defaultValue="" className="field">
                  <option value="" disabled>Selecione…</option>
                  {contas.map((c) => <option key={c.id} value={c.id}>{c.tipo === 'caixa' ? '💵' : '🏦'} {c.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Valor (R$)</label>
                <CampoDinheiro name="valor" required />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-600">Motivo</label>
                <input name="motivo" className="field" placeholder="Ex: retirada pro banco, troco, despesa" />
              </div>
              <div className="flex gap-2 pt-1">
                <SubmitButton pendingText="Registrando..." className="flex-1 rounded-xl bg-[#b42318] py-2.5 text-sm font-bold text-white hover:brightness-95 disabled:opacity-60 transition">Retirar do caixa</SubmitButton>
                <button type="button" onClick={() => setAberto(false)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
