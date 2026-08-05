import type { ReactNode } from 'react'

// Painel de Busca Avançada reutilizável (Isa 29/07). Casca colapsável padrão:
// resumo "🔎 Busca Avançada" + badge quando há filtro ativo + conteúdo (form ou
// controles). Cada tela põe seus próprios campos dentro. Nativo (<details>), sem JS.
// Usado em: Financeiro, Clientes, Fiados. Reaproveitar em qualquer lista nova.
export function BuscaAvancada({ ativo = false, children }: { ativo?: boolean; children: ReactNode }) {
  return (
    <details open={ativo} className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-700">
        🔎 Busca Avançada
        {ativo && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">filtros ativos</span>}
      </summary>
      <div className="border-t border-gray-100 p-4">{children}</div>
    </details>
  )
}
