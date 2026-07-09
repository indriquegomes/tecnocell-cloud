'use client'

import { useState } from 'react'
import { lancarHora } from './actions'
import { SubmitButton } from '@/components/SubmitButton'

type Pessoa = { id: string; nome: string }

const MOTIVOS_ADD = [
  { v: 'solicitacao_loja', l: 'Solicitação da loja' },
  { v: 'cobrir_colega', l: 'Cobrir colega' },
  { v: 'outro', l: 'Outro' },
]
const MOTIVOS_TIRAR = [
  { v: 'atraso', l: 'Atraso' },
  { v: 'pagamento', l: 'Pagamento das horas' },
  { v: 'folga', l: 'Conversão em folga' },
  { v: 'outro', l: 'Outro' },
]

export function LancarHoraForm({ pessoas }: { pessoas: Pessoa[] }) {
  const [op, setOp] = useState<'adicionar' | 'retirar'>('adicionar')
  const motivos = op === 'adicionar' ? MOTIVOS_ADD : MOTIVOS_TIRAR

  return (
    <form action={lancarHora} className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <div className="lg:col-span-2">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Pessoa</label>
        <select name="usuario_id" className="field" required>
          <option value="">Selecione…</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Operação</label>
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-sm">
          <button type="button" onClick={() => setOp('adicionar')} className={`flex-1 px-2 py-2 font-semibold transition ${op === 'adicionar' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>+ Add</button>
          <button type="button" onClick={() => setOp('retirar')} className={`flex-1 border-l border-gray-200 px-2 py-2 font-semibold transition ${op === 'retirar' ? 'bg-rose-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>− Tirar</button>
        </div>
        <input type="hidden" name="operacao" value={op} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Horas</label>
        <input name="horas" type="number" step="0.01" min="0" placeholder="1,5" className="field" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Data</label>
        <input name="data" type="date" className="field" defaultValue={new Date().toLocaleDateString('en-CA')} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Motivo</label>
        <select name="motivo" className="field">
          {motivos.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
      </div>
      <div className="lg:col-span-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Observação (opcional)</label>
        <input name="obs" className="field" placeholder="Ex: ficou até 20h a pedido da loja" />
      </div>
      <div className="lg:col-span-2">
        <SubmitButton pendingText="Lançando…" className="w-full rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
          Lançar hora
        </SubmitButton>
      </div>
    </form>
  )
}
