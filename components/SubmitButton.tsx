'use client'

import { useFormStatus } from 'react-dom'

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
        {pending && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
          </svg>
        )}
        {pending ? (pendingText ?? 'Carregando...') : children}
      </span>
    </button>
  )
}
