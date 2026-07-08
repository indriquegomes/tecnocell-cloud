'use client'

import { useFormStatus } from 'react-dom'
import { Spinner } from './Spinner'

// Botão de submit que mostra "carregando" (spinner) enquanto a server action roda.
// Precisa estar DENTRO de um <form action={...}> — o useFormStatus lê o estado dele.
export function SubmitButton({
  children,
  className,
  pendingText,
  disabled,
}: {
  children: React.ReactNode
  className?: string
  pendingText?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || disabled} className={className} aria-busy={pending}>
      <span className="inline-flex items-center justify-center gap-2">
        {pending && <Spinner />}
        {pending ? (pendingText ?? 'Carregando...') : children}
      </span>
    </button>
  )
}
