'use client'

import { useSearchParams } from 'next/navigation'

// O callback do OAuth manda ?ml=conectado / ?ml=erro na volta do Mercado
// Livre — mas essa página redireciona de novo (page.tsx, quando já tem
// conta) antes de qualquer server component conseguir ler o searchParams.
// Um client component lendo a URL do navegador funciona nos dois casos
// (com ou sem esse redirect no meio).
export function AvisoConexaoML() {
  const params = useSearchParams()
  const ml = params.get('ml')
  if (ml !== 'conectado' && ml !== 'erro') return null

  return ml === 'conectado' ? (
    <p className="rounded-xl bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
      Conta do Mercado Livre conectada com sucesso.
    </p>
  ) : (
    <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
      Não deu pra conectar a conta do Mercado Livre. Tente de novo.
    </p>
  )
}
