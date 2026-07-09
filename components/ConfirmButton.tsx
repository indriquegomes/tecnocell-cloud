'use client'

import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/Spinner'

interface Props {
  message: string
  className?: string
  children: React.ReactNode
}

export function ConfirmButton({ message, className, children }: Props) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => { if (!confirm(message)) e.preventDefault() }}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {pending && <Spinner />}
        {children}
      </span>
    </button>
  )
}
