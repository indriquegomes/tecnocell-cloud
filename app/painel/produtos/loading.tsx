export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded-lg bg-gray-200" />
        <div className="h-9 w-32 rounded-xl bg-gray-200" />
      </div>
      <div className="flex gap-3">
        <div className="h-9 w-48 rounded-lg bg-gray-200" />
        <div className="h-9 w-40 rounded-lg bg-gray-200" />
        <div className="h-9 w-32 rounded-lg bg-gray-200" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 flex gap-4">
          {[...Array(7)].map((_, i) => <div key={i} className="h-3 flex-1 rounded bg-gray-200" />)}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-50">
            <div className="h-4 flex-1 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
