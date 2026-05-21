export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 rounded-lg bg-gray-200" />
        <div className="h-9 w-36 rounded-xl bg-gray-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <div className="h-4 w-24 rounded bg-gray-200 mx-auto mb-2" />
            <div className="h-8 w-12 rounded bg-gray-200 mx-auto" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-50">
            <div className="h-4 flex-1 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-4 w-28 rounded bg-gray-200" />
            <div className="h-4 w-12 rounded bg-gray-200" />
            <div className="h-5 w-14 rounded-full bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
