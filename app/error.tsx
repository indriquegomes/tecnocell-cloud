'use client'

import { useEffect } from 'react'

// Erro fora do painel (login, loja virtual, convite). Sem este arquivo, essas
// telas caíam na página padrão do Next em inglês. Next 16 chama o retry de
// `unstable_retry` (era `reset` nas versões antigas).
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
        <p className="text-4xl">⚠️</p>
        <h1 className="mt-3 text-xl font-bold text-red-800">Página não carregou</h1>
        <p className="mt-2 text-sm text-red-700">
          O sistema encontrou um problema. Nada foi alterado no seu cadastro nem nos pedidos.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-red-500">Código do erro: {error.digest}</p>
        )}
        <button
          onClick={() => unstable_retry()}
          className="mt-6 rounded-xl bg-[#1B6CA8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#155a8f]"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  )
}
