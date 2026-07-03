'use client'

// Botão de exportar CSV genérico. Recebe as linhas já prontas e as colunas.
// Formato pt-BR: separador ';' e BOM (pra o Excel abrir com acento certo).
type Col = { key: string; label: string; money?: boolean }

function celula(v: unknown, money?: boolean): string {
  if (v == null) return ''
  if (money && typeof v === 'number') return v.toFixed(2).replace('.', ',')
  const s = String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function ExportCsv({ rows, cols, filename }: { rows: Record<string, unknown>[]; cols: Col[]; filename: string }) {
  const exportar = () => {
    const head = cols.map((c) => c.label).join(';')
    const body = rows.map((r) => cols.map((c) => celula(r[c.key], c.money)).join(';')).join('\n')
    const csv = '﻿' + head + '\n' + body
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={exportar}
      disabled={rows.length === 0}
      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
    >
      ⬇ Exportar CSV
    </button>
  )
}
