'use client'

import Link from 'next/link'
import { useEffect } from 'react'

// Tela de erro do painel — antes um erro de servidor mostrava a página padrão
// do Next ("Application error: a server-side exception has occurred"), em
// inglês e sem saída. Aqui a atendente vê o que aconteceu e tem como tentar de
// novo sem perder o lugar em que estava.
// Next 16 chama o retry de `unstable_retry` (o `reset` das versões antigas).
export default function PainelError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    // Fica no console do navegador e no log do servidor (Sentry escuta os dois).
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
      <p className="text-4xl">⚠️</p>
      <h2 className="mt-3 text-xl font-bold text-red-800">Esta tela não carregou</h2>
      <p className="mt-2 text-sm text-red-700">
        O sistema encontrou um problema ao buscar os dados. <strong>Nada foi alterado</strong> —
        sua venda, conta ou cadastro continua como estava.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-red-500">
          Código do erro (fale com quem cuida do sistema): {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => unstable_retry()}
          className="rounded-xl bg-[#1B6CA8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#155a8f]"
        >
          Tentar de novo
        </button>
        <Link
          href="/painel"
          className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Voltar ao painel
        </Link>
      </div>
    </div>
  )
}
