'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Recarrega os dados do servidor sem recarregar a página: router.refresh() refaz só
// o componente de servidor e troca o conteúdo no lugar, mantendo rolagem e foco.
//
// Pausa quando a aba está em segundo plano — deixar isso batendo no banco a cada 15s
// numa aba esquecida o dia todo é gasto puro, e ninguém está olhando mesmo.
export default function AutoAtualiza({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter()
  const [ligado, setLigado] = useState(true)
  const [ultima, setUltima] = useState<Date | null>(null)

  useEffect(() => {
    if (!ligado) return
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      router.refresh()
      setUltima(new Date())
    }, segundos * 1000)
    return () => clearInterval(t)
  }, [ligado, segundos, router])

  return (
    <button
      type="button"
      onClick={() => setLigado((v) => !v)}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
        ligado
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
      }`}
      title={ligado ? `Atualizando a cada ${segundos}s — clique para pausar` : 'Pausado — clique para retomar'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ligado ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`} />
      {ligado ? 'ao vivo' : 'pausado'}
      {ligado && ultima && (
        <span className="tabular-nums text-emerald-600/70">
          {ultima.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      )}
    </button>
  )
}
