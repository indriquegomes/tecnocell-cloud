'use client'

interface Props {
  action: () => Promise<void>
  mensagem?: string
}

export function BotaoExcluir({ action, mensagem = 'Excluir este registro?' }: Props) {
  return (
    <form action={action}>
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 transition"
        onClick={(e) => { if (!confirm(mensagem)) e.preventDefault() }}
      >
        Excluir
      </button>
    </form>
  )
}
