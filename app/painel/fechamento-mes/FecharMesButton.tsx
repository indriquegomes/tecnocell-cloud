'use client'

import { useActionState } from 'react'
import { alternarFechamento } from './actions'
import { CampoDinheiro } from '@/components/CampoDinheiro'

type Estado = { erro?: string; ok?: boolean }
type Loja = { id: string; nome: string; caixaFinal: number }

export function FecharMesButton({ mes, fechado, lojas }: { mes: string; fechado: boolean; lojas: Loja[] }) {
  const [state, action, pending] = useActionState<Estado | null, FormData>(alternarFechamento, null)

  if (fechado) {
    return (
      <form action={action} className="flex items-center gap-3">
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="fechado" value="1" />
        <button type="submit" disabled={pending}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 bg-gray-500 hover:bg-gray-600">
          {pending ? 'Salvando…' : '🔓 Reabrir mês'}
        </button>
        {state?.erro && <span className="text-sm text-red-600">{state.erro}</span>}
      </form>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="fechado" value="0" />

      <div>
        <p className="text-sm font-semibold text-gray-700">Confira o caixa final de cada loja antes de fechar</p>
        <p className="text-xs text-gray-400">É o dinheiro que fica na mão no fim do mês — vira o caixa inicial do mês seguinte.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {lojas.map((l) => (
          <div key={l.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-sm font-semibold text-gray-700">{l.nome}</p>
            <CampoDinheiro name={'caixa_final_' + l.id} defaultValue={l.caixaFinal} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700">
          {pending ? 'Salvando…' : '🔒 Fechar mês'}
        </button>
        {state?.erro && <span className="text-sm text-red-600">{state.erro}</span>}
      </div>
    </form>
  )
}
