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

// Passo das setas (em minutos) pra subir/descer o tempo.
const PASSO_MIN = 15

function parseMin(s: string): number {
  const t = (s || '').trim().toLowerCase().replace(/[.,]/g, ':').replace('h', ':')
  const [hhStr, mmStr] = t.split(':')
  const hh = Number(hhStr)
  if (!Number.isFinite(hh) || hh < 0) return NaN
  const mm = mmStr === undefined || mmStr === '' ? 0 : Number(mmStr)
  if (!Number.isFinite(mm) || mm < 0 || mm > 59) return NaN
  return hh * 60 + mm
}

function fmtHora(min: number): string {
  return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0')
}

function CampoHora() {
  const [v, setV] = useState('')
  const ajustar = (delta: number) => {
    const min = parseMin(v)
    const base = Number.isFinite(min) ? min : 0
    setV(fmtHora(Math.max(0, base + delta)))
  }
  return (
    <div className="relative">
      <input name="horas" type="text" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="1:35" title="Formato hora:minuto (ex: 1:35)" className="field pr-7" required />
      <div className="absolute inset-y-0 right-0 flex w-7 flex-col overflow-hidden rounded-r-lg">
        <button type="button" onClick={() => ajustar(PASSO_MIN)} className="flex flex-1 items-center justify-center text-[10px] leading-none text-gray-400 hover:bg-blue-50 hover:text-blue-700" aria-label="Aumentar 15 min">▲</button>
        <button type="button" onClick={() => ajustar(-PASSO_MIN)} className="flex flex-1 items-center justify-center text-[10px] leading-none text-gray-400 hover:bg-blue-50 hover:text-blue-700" aria-label="Diminuir 15 min">▼</button>
      </div>
    </div>
  )
}

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
        <CampoHora />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Data</label>
        <input name="data" type="date" className="field" defaultValue={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })} />
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
