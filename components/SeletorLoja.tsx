'use client'

import { useRouter } from 'next/navigation'

// Troca a loja ATIVA da sessão. Grava o cookie via rota (funciona na Vercel) e
// também o localStorage do PDV, pra o caixa abrir na mesma loja escolhida aqui.
export function SeletorLoja({
  lojas,
  ativa,
}: {
  lojas: { id: string; nome: string }[]
  ativa: string
}) {
  const router = useRouter()

  if (lojas.length <= 1) return null

  async function trocar(id: string) {
    if (!id || id === ativa) return
    try { localStorage.setItem('pdv_loja', id) } catch { /* privado — segue */ }
    await fetch('/api/trocar-loja', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ loja_id: id }),
    })
    router.refresh()
  }

  return (
    <label className="flex items-center gap-1.5" title="Trocar de loja">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Loja</span>
      <select
        value={ativa}
        onChange={(e) => trocar(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/40"
      >
        {lojas.map((l) => <option key={l.id} value={l.id}>🏬 {l.nome}</option>)}
      </select>
    </label>
  )
}
