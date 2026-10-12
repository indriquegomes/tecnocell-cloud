'use client'

import { useState } from 'react'
import { formatBRL } from '@/lib/utils'

// Copia o produto no formato "código - nome — R$ preço" pra colar no WhatsApp.
export function BotaoCopiarProduto({ codigo, nome, preco }: { codigo: string | null; nome: string; preco: number }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    const txt = `${codigo ? codigo + ' - ' : ''}${nome} — ${formatBRL(preco)}`
    try {
      await navigator.clipboard.writeText(txt)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* clipboard bloqueado */ }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition"
      title="Copiar código, nome e preço"
    >
      {copiado ? '✓ Copiado' : 'Copiar'}
    </button>
  )
}
