'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { aprovarEncomenda, rejeitarEncomenda, marcarComprada } from './actions'
import { formatBRL } from '@/lib/utils'

type Encomenda = {
  id: string; pessoa_nome: string; item_nome: string; temporario: boolean;
  quantidade: number; valor_venda: number | null; sinal: number; status: string;
}

// "Nota fixa" ENCOMENDAS ESPECIAIS na tela de Compras. Dois passos:
// 1) aberta → estoquista marca "Comprou" (visto) → vira "aguardando chegada".
// 2) comprada → peça chega → estoquista digita o custo e marca "Chegou" (entra no estoque).
export function EncomendasEspeciais({ encomendas }: { encomendas: Encomenda[] }) {
  const router = useRouter()
  const [custos, setCustos] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  if (encomendas.length === 0) return null

  const abertas = encomendas.filter((e) => e.status === 'aberta')
  const compradas = encomendas.filter((e) => e.status === 'comprada')

  const comprar = async (e: Encomenda) => {
    setSalvando(e.id)
    await marcarComprada(e.id)
    setSalvando(null)
    router.refresh()
  }

  const aprovar = async (e: Encomenda) => {
    const custo = Number((custos[e.id] ?? '').replace(',', '.'))
    if (!(custo > 0)) { alert('Digite o custo da peça pra aprovar.'); return }
    setSalvando(e.id)
    await aprovarEncomenda(e.id, custo)
    setSalvando(null)
    router.refresh()
  }

  const rejeitar = async (e: Encomenda) => {
    if (!confirm(`Rejeitar a encomenda de ${e.pessoa_nome}?`)) return
    setSalvando(e.id)
    await rejeitarEncomenda(e.id)
    setSalvando(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {abertas.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[#F47920] bg-orange-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">📦 ENCOMENDAS ESPECIAIS <span className="text-xs font-normal text-gray-500">(comprar no fornecedor)</span></h3>
            <span className="text-xs font-semibold text-[#F47920]">{abertas.length} pra comprar</span>
          </div>
          <div className="mt-3 space-y-2">
            {abertas.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800">
                    {e.item_nome}{e.temporario && <span className="ml-1 text-[10px] font-semibold text-orange-600">sem cadastro</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {e.pessoa_nome} · {e.quantidade} un · venda {formatBRL(e.valor_venda ?? 0)}{e.sinal > 0 ? ` · sinal ${formatBRL(e.sinal)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => comprar(e)} disabled={salvando === e.id}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">✓ Comprou</button>
                <button type="button" onClick={() => rejeitar(e)} disabled={salvando === e.id}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">✕ Rejeitar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {compradas.length > 0 && (
        <div className="rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">⏳ AGUARDANDO CHEGADA <span className="text-xs font-normal text-gray-500">(comprado no fornecedor)</span></h3>
            <span className="text-xs font-semibold text-blue-600">{compradas.length} aguardando</span>
          </div>
          <div className="mt-3 space-y-2">
            {compradas.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800">
                    {e.item_nome}{e.temporario && <span className="ml-1 text-[10px] font-semibold text-orange-600">sem cadastro</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {e.pessoa_nome} · {e.quantidade} un · venda {formatBRL(e.valor_venda ?? 0)}{e.sinal > 0 ? ` · sinal ${formatBRL(e.sinal)}` : ''}
                  </p>
                </div>
                <input type="number" step="0.01" min="0" placeholder="Custo R$" value={custos[e.id] ?? ''}
                  onChange={(ev) => setCustos((c) => ({ ...c, [e.id]: ev.target.value }))} className="field w-28" />
                <button type="button" onClick={() => aprovar(e)} disabled={salvando === e.id}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">✓ Chegou</button>
                <button type="button" onClick={() => rejeitar(e)} disabled={salvando === e.id}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50">✕ Rejeitar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
