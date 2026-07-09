'use client'

import { useState } from 'react'
import { salvarMeta } from './actions'
import { SubmitButton } from '@/components/SubmitButton'

type Loja = { id: string; nome: string }
type FaixaEdit = { nome: string; valor: string; premio: string }
type MetaEdit = {
  id: string; loja_id: string | null; rotulo: string; data_inicio: string; data_fim: string
  dias_uteis: number; ativo: boolean; faixas: { nome: string; valor: number; premio: number }[]
}

const FAIXAS_PADRAO: FaixaEdit[] = [
  { nome: 'GRANADA', valor: '', premio: '' },
  { nome: 'ESMERALDA', valor: '', premio: '' },
  { nome: 'DIAMANTE', valor: '', premio: '' },
  { nome: 'JOALHERIA', valor: '', premio: '' },
]

export function MetasForm({ lojas, editando }: { lojas: Loja[]; editando?: MetaEdit }) {
  const [faixas, setFaixas] = useState<FaixaEdit[]>(
    editando?.faixas?.length
      ? editando.faixas.map((f) => ({ nome: f.nome, valor: String(f.valor), premio: String(f.premio) }))
      : FAIXAS_PADRAO,
  )

  const set = (i: number, campo: keyof FaixaEdit, v: string) =>
    setFaixas((prev) => prev.map((f, j) => (j === i ? { ...f, [campo]: v } : f)))

  return (
    <form action={salvarMeta} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {editando && <input type="hidden" name="id" value={editando.id} />}
      <h3 className="text-sm font-semibold text-gray-800">{editando ? 'Editar meta' : 'Nova meta'}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Loja</label>
          <select name="loja_id" defaultValue={editando?.loja_id ?? ''} className="field" required>
            <option value="">Selecione…</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Rótulo</label>
          <input name="rotulo" defaultValue={editando?.rotulo ?? 'Metas de Julho'} className="field" placeholder="Ex: Metas de Julho" required />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Início</label>
          <input type="date" name="data_inicio" defaultValue={editando?.data_inicio ?? ''} className="field" required />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Fim</label>
          <input type="date" name="data_fim" defaultValue={editando?.data_fim ?? ''} className="field" required />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Dias úteis no período</label>
          <input type="number" name="dias_uteis" min="1" max="31" defaultValue={editando?.dias_uteis ?? 26} className="field" required />
        </div>
        <label className="flex items-center gap-2 pt-7 text-sm font-medium text-gray-700">
          <input type="hidden" name="ativo" value="0" />
          <input type="checkbox" name="ativo" value="1" defaultChecked={editando ? editando.ativo : true} className="h-4 w-4 rounded" />
          Meta ativa
        </label>
      </div>

      {/* Faixas */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Faixas (da menor pra maior)</label>
          <button type="button" onClick={() => setFaixas((p) => [...p, { nome: '', valor: '', premio: '' }])}
            className="text-xs font-medium text-blue-600 hover:text-blue-700">+ Adicionar faixa</button>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Nome</span><span>Meta (R$)</span><span>Prêmio (R$)</span><span></span>
          </div>
          {faixas.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
              <input name="faixa_nome" value={f.nome} onChange={(e) => set(i, 'nome', e.target.value.toUpperCase())} placeholder="GRANADA" className="field" />
              <input name="faixa_valor" value={f.valor} onChange={(e) => set(i, 'valor', e.target.value)} type="number" step="0.01" min="0" placeholder="250000" className="field" />
              <input name="faixa_premio" value={f.premio} onChange={(e) => set(i, 'premio', e.target.value)} type="number" step="0.01" min="0" placeholder="250" className="field" />
              <button type="button" onClick={() => setFaixas((p) => p.filter((_, j) => j !== i))}
                className="px-2 text-gray-300 hover:text-red-500 transition" title="Remover">✕</button>
            </div>
          ))}
        </div>
      </div>

      <SubmitButton pendingText="Salvando…" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60">
        Salvar meta
      </SubmitButton>
    </form>
  )
}
