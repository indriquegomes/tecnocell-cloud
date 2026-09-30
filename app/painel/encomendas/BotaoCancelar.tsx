'use client'

import { useRouter } from 'next/navigation'
import { cancelarEncomenda } from './actions'

// Botão de cancelar (cliente desistiu) na lista de encomendas do Estoque.
export function BotaoCancelar({ id }: { id: string }) {
  const router = useRouter()
  return (
    <button type="button"
      onClick={async () => {
        if (!confirm('Cancelar esta encomenda? O cliente desistiu?')) return
        await cancelarEncomenda(id)
        router.refresh()
      }}
      className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition">
      Cancelar
    </button>
  )
}

