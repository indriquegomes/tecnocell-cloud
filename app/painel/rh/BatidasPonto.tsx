'use client'

import { useState } from 'react'
import { ajustarPonto, excluirPonto, incluirPonto } from './actions'

type Batida = { id: string; tipo: string; criado_em: string }

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' })

const ICONE: Record<string, string> = { entrada: '▶', retorno: '▶', pausa: '⏸', saida: '⏹' }
const TIPOS = ['entrada', 'pausa', 'retorno', 'saida'] as const
const LABEL: Record<string, string> = { entrada: 'Entrada', retorno: 'Retorno', pausa: 'Pausa', saida: 'Saída' }

// Batidas do dia de UMA pessoa. Master pode ajustar (editar hora/tipo, excluir) e
// incluir batida que faltou — sem mexer no banco na mão.
export function BatidasPonto({ batidas, usuarioId, isMaster }: {
  batidas: Batida[]
  usuarioId: string
  isMaster: boolean
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [incluindo, setIncluindo] = useState(false)

  const chip = (p: Batida, editavel = false) => (
    <span key={p.id} className="inline-flex items-center gap-1 rounded bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-500">
      {ICONE[p.tipo] ?? '▶'}{fmtHora(p.criado_em)}
      {editavel && (
        <button type="button" onClick={() => setEditando(p.id)} title="Ajustar batida" className="ml-0.5 rounded text-gray-400 hover:text-blue-600">✏️</button>
      )}
    </span>
  )

  if (!isMaster) {
    return (
      <div className="flex flex-wrap gap-1">
        {batidas.length === 0 ? <span className="text-xs text-gray-300">sem batidas</span> : batidas.map((p) => chip(p))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {batidas.length === 0 && !incluindo && <span className="text-xs text-gray-300">sem batidas</span>}

      {batidas.map((p) =>
        editando === p.id ? (
          <span key={p.id} className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 p-1">
            <form action={ajustarPonto} className="inline-flex items-center gap-1">
              <input type="hidden" name="ponto_id" value={p.id} />
              <select name="tipo" defaultValue={p.tipo} className="rounded border border-gray-200 px-1 py-0.5 text-[11px]">
                {TIPOS.map((t) => <option key={t} value={t}>{LABEL[t]}</option>)}
              </select>
              <input type="time" name="hora" defaultValue={fmtHora(p.criado_em)} required className="rounded border border-gray-200 px-1 py-0.5 text-[11px]" />
              <button type="submit" title="Salvar" className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700">✓</button>
              <button type="button" onClick={() => setEditando(null)} title="Cancelar" className="rounded px-1 py-0.5 text-[11px] text-gray-500 hover:bg-gray-200">✕</button>
            </form>
            <form action={excluirPonto.bind(null, p.id)} className="inline-flex">
              <button type="submit" title="Excluir batida" className="rounded px-1 py-0.5 text-[11px] text-red-500 hover:bg-red-50" onClick={(e) => { if (!confirm('Excluir esta batida?')) e.preventDefault() }}>🗑</button>
            </form>
          </span>
        ) : chip(p, true)
      )}

      {incluindo ? (
        <form action={incluirPonto} className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 p-1">
          <input type="hidden" name="usuario_id" value={usuarioId} />
          <select name="tipo" className="rounded border border-gray-200 px-1 py-0.5 text-[11px]">
            {TIPOS.map((t) => <option key={t} value={t}>{LABEL[t]}</option>)}
          </select>
          <input type="time" name="hora" required className="rounded border border-gray-200 px-1 py-0.5 text-[11px]">
          </input>
          <button type="submit" title="Salvar" className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-700">✓</button>
          <button type="button" onClick={() => setIncluindo(false)} title="Cancelar" className="rounded px-1 py-0.5 text-[11px] text-gray-500 hover:bg-gray-200">✕</button>
        </form>
      ) : (
        <button type="button" onClick={() => setIncluindo(true)} title="Incluir batida que faltou" className="inline-flex h-5 w-5 items-center justify-center rounded border border-dashed border-gray-300 text-xs text-gray-400 hover:border-emerald-400 hover:text-emerald-600">+</button>
      )}
    </div>
  )
}

