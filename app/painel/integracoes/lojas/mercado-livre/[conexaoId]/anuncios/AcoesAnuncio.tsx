'use client'

import { useActionState, useState, useEffect } from 'react'
import { CampoDinheiro } from '@/components/CampoDinheiro'
import { desvincularAnuncio, atualizarAnuncioDoML, editarPrecoAnuncio, type ActionState } from './actions'

function BotaoAtualizar({ anuncioId, mlItemId, conexaoId }: { anuncioId: string; mlItemId: string; conexaoId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(atualizarAnuncioDoML, null)
  return (
    <form action={action} className="inline-flex items-center gap-1">
      <input type="hidden" name="anuncioId" value={anuncioId} />
      <input type="hidden" name="mlItemId" value={mlItemId} />
      <input type="hidden" name="conexaoId" value={conexaoId} />
      <button type="submit" disabled={pending}
        className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition disabled:opacity-50">
        {pending ? 'Atualizando...' : 'Atualizar'}
      </button>
      {state && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
    </form>
  )
}

function BotaoDesvincular({ anuncioId, conexaoId }: { anuncioId: string; conexaoId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(desvincularAnuncio, null)
  return (
    <form action={action}
      onSubmit={(e) => { if (!confirm('Desvincular este anúncio do produto? O anúncio continua no Mercado Livre, só para de bater com o produto aqui.')) e.preventDefault() }}
      className="inline-flex items-center gap-1">
      <input type="hidden" name="anuncioId" value={anuncioId} />
      <input type="hidden" name="conexaoId" value={conexaoId} />
      <button type="submit" disabled={pending}
        className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50">
        {pending ? '...' : 'Desvincular'}
      </button>
      {state && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
    </form>
  )
}

function BotaoEditarPreco({ anuncioId, mlItemId, conexaoId, precoAtual }: { anuncioId: string; mlItemId: string; conexaoId: string; precoAtual: number }) {
  const [aberto, setAberto] = useState(false)
  const [state, action, pending] = useActionState<ActionState, FormData>(editarPrecoAnuncio, null)

  useEffect(() => { if (state?.ok) setAberto(false) }, [state])

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition">
        Editar Preço
      </button>
    )
  }

  return (
    <form action={action} className="inline-flex items-center gap-1">
      <input type="hidden" name="anuncioId" value={anuncioId} />
      <input type="hidden" name="mlItemId" value={mlItemId} />
      <input type="hidden" name="conexaoId" value={conexaoId} />
      <CampoDinheiro name="preco" defaultValue={precoAtual} required autoFocus className="w-24 py-1 text-xs" />
      <button type="submit" disabled={pending}
        className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition disabled:opacity-50">
        {pending ? '...' : 'Salvar'}
      </button>
      <button type="button" onClick={() => setAberto(false)}
        className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 transition">
        Cancelar
      </button>
      {state && !state.ok && <span className="text-xs text-red-600">{state.message}</span>}
    </form>
  )
}

export function AcoesAnuncio({ anuncioId, mlItemId, conexaoId, precoAtual }: { anuncioId: string; mlItemId: string; conexaoId: string; precoAtual: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <BotaoAtualizar anuncioId={anuncioId} mlItemId={mlItemId} conexaoId={conexaoId} />
      <BotaoEditarPreco anuncioId={anuncioId} mlItemId={mlItemId} conexaoId={conexaoId} precoAtual={precoAtual} />
      <BotaoDesvincular anuncioId={anuncioId} conexaoId={conexaoId} />
    </div>
  )
}
