'use client'

import { useActionState } from 'react'
import { alternarFechamento } from './actions'

type Estado = { erro?: string; ok?: boolean }

export function FecharMesButton({ mes, fechado }: { mes: string; fechado: boolean }) {
  const [state, action, pending] = useActionState<Estado | null, FormData>(alternarFechamento, null)
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="fechado" value={fechado ? '1' : '0'} />
      <button type="submit" disabled={pending}
        className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${fechado ? 'bg-gray-500 hover:bg-gray-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
        {pending ? 'Salvando…' : fechado ? '🔓 Reabrir mês' : '🔒 Fechar mês'}
      </button>
      {state?.erro && <span className="text-sm text-red-600">{state.erro}</span>}
    </form>
  )
}
