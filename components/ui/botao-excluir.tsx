'use client'

import { useFormStatus } from 'react-dom'
import { Spinner } from '@/components/Spinner'

interface Props {
  action: () => Promise<void>
  mensagem?: string
}

// Botão interno: useFormStatus precisa estar DENTRO do <form> pra ler o pending.
function BotaoInterno({ mensagem }: { mensagem: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition disabled:opacity-60"
      onClick={(e) => { if (!confirm(mensagem)) e.preventDefault() }}
    >
      {pending && <Spinner />}
      {pending ? 'Excluindo…' : 'Excluir'}
    </button>
  )
}

export function BotaoExcluir({ action, mensagem = 'Excluir este registro?' }: Props) {
  return (
    <form action={action}>
      <BotaoInterno mensagem={mensagem} />
    </form>
  )
}
