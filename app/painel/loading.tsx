import { Carregando } from '@/components/Carregando'

export default function Loading() {
  return (
    <div className="space-y-6">
      <Carregando />
      <div className="space-y-6 animate-pulse opacity-60">
      <div className="h-8 w-48 rounded-lg bg-gray-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="h-4 w-24 rounded bg-gray-200 mb-3" />
            <div className="h-8 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-50">
            <div className="h-4 flex-1 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}
