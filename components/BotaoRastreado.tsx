'use client'

import { useCallback } from 'react'
import { registrarClique } from '@/app/actions/log'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  acao: string
  contexto?: Record<string, unknown>
}

// Envolve os botões que movem dinheiro. O log sai em paralelo ao onClick — a ação da
// usuária não espera o registro, e um log que falha não impede a venda.
export default function BotaoRastreado({ acao, contexto, onClick, children, ...props }: Props) {
  const handle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      void registrarClique(acao, contexto ?? {}, window.location.pathname)
      onClick?.(e)
    },
    [acao, contexto, onClick],
  )
  return (
    <button {...props} onClick={handle}>
      {children}
    </button>
  )
}
