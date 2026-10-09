'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cancelarRemessa } from '../actions'

// Botão de cancelar remessa em trânsito: abre um modal pedindo o motivo e
// devolve o estoque pra origem.
export function CancelarRemessaButton({ id }: { id: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')

  async function confirmar() {
    if (!motivo.trim()) { alert('Digite o motivo do cancelamento.'); return }
    const r = await cancelarRemessa(id, motivo.trim())
    if ('erro' in r) { alert(r.erro); return }
    setAberto(false)
    setMotivo('')
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition">
        Cancelar
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAberto(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">Cancelar remessa</h3>
            <p className="mt-1 text-sm text-gray-500">O estoque volta pra origem. Digite o motivo:</p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              autoFocus
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="Ex: errei o destino"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAberto(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Voltar
              </button>
              <button type="button" onClick={confirmar}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition">
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
