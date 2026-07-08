'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exportarRelatorio } from './actions'

// Igual ao ExportCsv, mas busca as linhas SÓ no clique (server action) — pra abas
// pesadas (precificação, inventário, contatos, estoque) não embutirem milhares de
// linhas no HTML. A tela mostra só uma amostra; o CSV sai completo.
type Col = { key: string; label: string; money?: boolean }

function celula(v: unknown, money?: boolean): string {
  if (v == null) return ''
  if (money && typeof v === 'number') return v.toFixed(2).replace('.', ',')
  const s = String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const supabaseBrowser = createClient()

export function ExportCsvLazy({ aba, cols, filename }: {
  aba: 'precificacao' | 'inventario' | 'contatos' | 'estoque'
  cols: Col[]
  filename: string
}) {
  const [carregando, setCarregando] = useState(false)

  const exportar = async () => {
    setCarregando(true)
    try {
      const { data } = await supabaseBrowser.auth.getSession()
      const rows = await exportarRelatorio(data.session?.access_token ?? '', aba)
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
    } catch {
      /* silencioso — botão volta ao normal */
    } finally {
      setCarregando(false)
    }
  }

  return (
    <button
      onClick={exportar}
      disabled={carregando}
      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-40"
    >
      {carregando ? '⏳ Gerando…' : '⬇ Exportar CSV (completo)'}
    </button>
  )
}
