'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { desconectarMercadoLivre } from './actions'

export function DesconectarBotao({ conexaoId }: { conexaoId: string }) {
  const router = useRouter()
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const handleClick = async () => {
    setCarregando(true)
    setErro('')
    try {
      const res = await desconectarMercadoLivre(conexaoId)
      if (!res.ok) setErro(res.erro ?? 'Erro ao desconectar.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao desconectar — tente de novo.')
    } finally {
      setCarregando(false)
      router.refresh()
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={handleClick} disabled={carregando}
        className="w-full rounded-xl border border-red-200 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 transition">
        {carregando ? 'Desconectando...' : 'Desconectar'}
      </button>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  )
}
