import type { ReactNode } from 'react'

// Estado vazio canônico do sistema — ícone (Lucide) + título + descrição + ação
// opcional. Usar sempre que uma lista/tela não tiver conteúdo, no lugar de texto solto.
export function EmptyState({
  icon, title, description, action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-14 text-center">
      {icon && (
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-50 text-gray-300">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
      </div>
      {action}
    </div>
  )
}
