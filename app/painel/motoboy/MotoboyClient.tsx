'use client'

import { registrarRota } from './actions'
import { formatBRL, hojeSP } from '@/lib/utils'
import { useRef, useState } from 'react'

type Loja = { id: string; nome: string }
type Motoboy = { id: string; nome: string; motoboy_valor_fixo: number | null; motoboy_adicional_loja: number | null; motoboy_adicional_extra: number | null; motoboy_tipo: string | null }
type Rota = { id: string; perfil_id: string; data: string; loja_id: string | null; entregas: number; extras: number; observacao: string | null; lojas: { nome: string }[] | null }

const fmtData = (d: string) => d.split('-').reverse().join('/')

export function MotoboyClient({ motoboys, rotas, lojas, userId, isMaster, erro }: { motoboys: Motoboy[]; rotas: Rota[]; lojas: Loja[]; userId: string; isMaster: boolean; erro?: string }) {
  const [perfilSel, setPerfilSel] = useState(isMaster ? (motoboys[0]?.id ?? '') : userId)
  const [entregas, setEntregas] = useState(0)
  const [extras, setExtras] = useState(0)
  const [confirmado, setConfirmado] = useState(false)
  const [resumoAberto, setResumoAberto] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const motoboySel = motoboys.find((m) => m.id === perfilSel) ?? motoboys[0]
  const fixo = Number(motoboySel?.motoboy_valor_fixo) || 0
  const valLoja = Number(motoboySel?.motoboy_adicional_loja) || 0
  const valExtra = Number(motoboySel?.motoboy_adicional_extra) || 0
  const totalRota = fixo + entregas * valLoja + extras * valExtra

  const porMotoboy: Record<string, Rota[]> = {}
  for (const r of rotas) (porMotoboy[r.perfil_id] = porMotoboy[r.perfil_id] || []).push(r)

  const resumo = motoboys.map((m) => {
    const rs = porMotoboy[m.id] || []
    const dias = new Set(rs.map((r) => r.data)).size
    const entregas = rs.reduce((s, r) => s + (r.entregas || 0), 0)
    const extras = rs.reduce((s, r) => s + (r.extras || 0), 0)
    const fixo = Number(m.motoboy_valor_fixo) || 0
    const loja = Number(m.motoboy_adicional_loja) || 0
    const extra = Number(m.motoboy_adicional_extra) || 0
    const total = dias * fixo + dias * loja + extras * extra
    return { m, dias, entregas, extras, total }
  })

  return (
    <div className="space-y-6">
      <form ref={formRef} action={registrarRota} onSubmit={(e) => { if (!confirmado) { e.preventDefault(); setResumoAberto(true) } }} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-gray-700">Registrar rota</p>

        {/* Diária fixa — congelada, não muda */}
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-500">Diária fixa</span>
          <span className="font-bold text-gray-900">{formatBRL(fixo)}</span>
          <span className="text-[11px] text-gray-400">(fixo — não altera)</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isMaster && motoboys.length > 1 && (
            <div>
              <label className="mb-1 block text-xs text-gray-500">Motoboy</label>
              <select name="perfil_id" value={perfilSel} onChange={(e) => setPerfilSel(e.target.value)} className="field w-full text-sm">
                {motoboys.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
          )}
          {!isMaster && <input type="hidden" name="perfil_id" value={userId} />}
          {isMaster && motoboys.length <= 1 && <input type="hidden" name="perfil_id" value={motoboys[0]?.id ?? ''} />}
          <div>
            <label className="mb-1 block text-xs text-gray-500">Data</label>
            <input name="data" type="date" defaultValue={hojeSP()} className="field w-full text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Loja</label>
            <select name="loja_id" className="field w-full text-sm">
              <option value="">—</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Entregas por loja</label>
            <input name="entregas" type="number" min="0" value={entregas} onChange={(e) => setEntregas(parseInt(e.target.value) || 0)} className="field w-full text-sm" />
            <span className="text-[11px] text-gray-500">valor fixo {formatBRL(valLoja)} por entrega</span>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Entregas extras</label>
            <input name="extras" type="number" min="0" value={extras} onChange={(e) => setExtras(parseInt(e.target.value) || 0)} className="field w-full text-sm" />
            <span className="text-[11px] text-gray-500">valor fixo {formatBRL(valExtra)} por extra</span>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Observação (opcional)</label>
          <input name="observacao" className="field w-full text-sm" placeholder="Ex: rota extra Itaipava" />
        </div>
        <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">Salvar rota</button>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </form>

      {/* Resumo detalhado antes de enviar */}
      {resumoAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setResumoAberto(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">Resumo da rota</h3>
            <p className="text-xs text-gray-500">Confira antes de enviar.</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600"><span>Diária fixa</span><span className="tabular-nums">{formatBRL(fixo)}</span></div>
              <div className="flex justify-between text-gray-600"><span>{entregas} entrega{entregas !== 1 ? 's' : ''} × {formatBRL(valLoja)}</span><span className="tabular-nums">{formatBRL(entregas * valLoja)}</span></div>
              <div className="flex justify-between text-gray-600"><span>{extras} extra{extras !== 1 ? 's' : ''} × {formatBRL(valExtra)}</span><span className="tabular-nums">{formatBRL(extras * valExtra)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-gray-900"><span>Total</span><span className="tabular-nums">{formatBRL(totalRota)}</span></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setResumoAberto(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
              <button type="button" onClick={() => { setConfirmado(true); formRef.current?.requestSubmit() }} className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">Confirmar e enviar</button>
            </div>
          </div>
        </div>
      )}

      {isMaster && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3"><h3 className="text-base font-semibold text-gray-800">Resumo por motoboy</h3></div>
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Motoboy</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Dias</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Entregas</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Extras</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {resumo.map((r) => (
                <tr key={r.m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm font-medium text-gray-800">{r.m.nome}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-600">{r.dias}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-600">{r.entregas}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-600">{r.extras}</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">{formatBRL(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-3"><h3 className="text-base font-semibold text-gray-800">Rotas registradas</h3></div>
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Data</th>
              {isMaster && <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Motoboy</th>}
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Loja</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Entregas</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-gray-500">Extras</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-gray-500">Obs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rotas.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-700">{fmtData(r.data)}</td>
                {isMaster && <td className="px-4 py-2 text-sm text-gray-700">{motoboys.find((m) => m.id === r.perfil_id)?.nome ?? '?'}</td>}
                <td className="px-4 py-2 text-sm text-gray-600">{r.lojas?.[0]?.nome ?? '—'}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-700">{r.entregas}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-700">{r.extras}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{r.observacao ?? ''}</td>
              </tr>
            ))}
            {rotas.length === 0 && <tr><td colSpan={isMaster ? 6 : 5} className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma rota registrada ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
