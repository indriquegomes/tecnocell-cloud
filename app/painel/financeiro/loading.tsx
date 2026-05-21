export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-lg bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-xl bg-gray-200" />
          <div className="h-9 w-24 rounded-xl bg-gray-200" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="h-4 w-28 rounded bg-gray-200 mb-2" />
            <div className="h-8 w-32 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-50">
            <div className="h-4 flex-1 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-5 w-16 rounded-full bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
