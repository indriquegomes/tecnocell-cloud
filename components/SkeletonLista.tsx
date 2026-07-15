import { Carregando } from '@/components/Carregando'

// Esqueleto genérico de tela-lista (cards de resumo + tabela). Aparece na HORA ao
// navegar, enquanto o server component busca os dados — dá a sensação de instantâneo
// que o Vitor quer. Reaproveitado pelos loading.tsx das telas de lista.
export function SkeletonLista({ cards = 3, linhas = 10 }: { cards?: number; linhas?: number }) {
  return (
    <div className="space-y-6">
      <Carregando />
      <div className="space-y-6 animate-pulse opacity-60">
        <div className="flex items-center justify-between">
          <div className="h-8 w-40 rounded-lg bg-gray-200" />
          <div className="h-9 w-36 rounded-xl bg-gray-200" />
        </div>
        {cards > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            {[...Array(cards)].map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
                <div className="mx-auto mb-2 h-4 w-24 rounded bg-gray-200" />
                <div className="mx-auto h-8 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {[...Array(linhas)].map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-gray-50 px-4 py-3">
              <div className="h-4 flex-1 rounded bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-200" />
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="h-4 w-12 rounded bg-gray-200" />
              <div className="h-5 w-14 rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
