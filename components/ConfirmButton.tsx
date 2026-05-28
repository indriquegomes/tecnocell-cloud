'use client'

interface Props {
  message: string
  className?: string
  children: React.ReactNode
}

export function ConfirmButton({ message, className, children }: Props) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => { if (!confirm(message)) e.preventDefault() }}
    >
      {children}
    </button>
  )
}