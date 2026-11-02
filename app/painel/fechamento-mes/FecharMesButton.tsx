'use client'

import { useActionState } from 'react'
import { alternarFechamento } from './actions'
import { CampoDinheiro } from '@/components/CampoDinheiro'

type Estado = { erro?: string; ok?: boolean }
type Loja = { id: string; nome: string; caixaFinal: number; caixaCalculado?: number }

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
        <p className="text-sm font-semibold text-gray-700">Digite o caixa final de cada loja antes de fechar</p>
        <p className="text-xs text-gray-400">É o dinheiro que fica na mão no fim do mês — vira o caixa inicial do mês seguinte. Digite o valor que você CONTou.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {lojas.map((l) => (
          <div key={l.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-sm font-semibold text-gray-700">{l.nome}</p>
            <CampoDinheiro name={'caixa_final_' + l.id} defaultValue={l.caixaFinal} />
            {(l.caixaCalculado ?? 0) > 0 && (
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                O app calcula {l.caixaCalculado!.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} em mãos
                (abertura + cédula que entrou − cédula que saiu). Serve de conferência, mas só vale o que você contou.
              </p>
            )}
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
