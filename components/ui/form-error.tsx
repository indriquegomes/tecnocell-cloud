'use client'

import { useEffect, useState } from 'react'

export function FormError({ error }: { error?: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (error) setVisible(true)
  }, [error])

  if (!visible || !error) return null

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-2">
      <span>{error}</span>
      <button type="button" onClick={() => setVisible(false)} className="shrink-0 text-red-400 hover:text-red-600">✕</button>
    </div>
  )
}
