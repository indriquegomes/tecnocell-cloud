'use client'

import { registrarRota } from './actions'
import { formatBRL, hojeSP } from '@/lib/utils'
import { useState } from 'react'

type Loja = { id: string; nome: string }
type Motoboy = { id: string; nome: string; motoboy_valor_fixo: number | null; motoboy_adicional_loja: number | null; motoboy_adicional_extra: number | null; motoboy_tipo: string | null }
type Rota = { id: string; perfil_id: string; data: string; loja_id: string | null; entregas: number; extras: number; observacao: string | null; lojas: { nome: string }[] | null }

const fmtData = (d: string) => d.split('-').reverse().join('/')

export function MotoboyClient({ motoboys, rotas, lojas, userId, isMaster, erro }: { motoboys: Motoboy[]; rotas: Rota[]; lojas: Loja[]; userId: string; isMaster: boolean; erro?: string }) {
  const [perfilSel, setPerfilSel] = useState(isMaster ? (motoboys[0]?.id ?? '') : userId)

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
      <form action={registrarRota} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold text-gray-700">Registrar rota</p>
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
            <label className="mb-1 block text-xs text-gray-500">Entregas</label>
            <input name="entregas" type="number" min="0" defaultValue="0" className="field w-full text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Extras</label>
            <input name="extras" type="number" min="0" defaultValue="0" className="field w-full text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Observação (opcional)</label>
          <input name="observacao" className="field w-full text-sm" placeholder="Ex: rota extra Itaipava" />
        </div>
        <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">Salvar rota</button>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </form>

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
