'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Recarrega os dados do servidor sem recarregar a página: router.refresh() refaz só
// o componente de servidor e troca o conteúdo no lugar, mantendo rolagem e foco.
//
// useTransition dá o estado "carregando" DE VERDADE — sabemos quando o refresh está no
// ar, então o spinner só aparece enquanto a busca acontece, não por tempo chutado.
//
// Pausa quando a aba está em segundo plano — deixar isso batendo no banco a cada 30s
// numa aba esquecida o dia todo é gasto puro, e ninguém está olhando mesmo.
export default function AutoAtualiza({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter()
  const [ligado, setLigado] = useState(true)
  const [ultima, setUltima] = useState<Date | null>(null)
  const [carregando, startTransition] = useTransition()

  const atualizarAgora = () => {
    startTransition(() => {
      router.refresh()
      setUltima(new Date())
    })
  }

  useEffect(() => {
    if (!ligado) return
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      atualizarAgora()
    }, segundos * 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligado, segundos])

  return (
    <>
      {/* Barra fina no topo enquanto busca — o sinal de "algo está acontecendo agora" */}
      {carregando && (
        <div className="fixed left-0 right-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent">
          <div className="h-full w-1/3 animate-[barra_1s_ease-in-out_infinite] bg-[#1B6CA8]" />
        </div>
      )}

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
        {carregando ? (
          <svg className="h-3 w-3 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <span className={`h-1.5 w-1.5 rounded-full ${ligado ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`} />
        )}
        {carregando ? 'atualizando…' : ligado ? 'ao vivo' : 'pausado'}
        {ligado && !carregando && ultima && (
          <span className="tabular-nums text-emerald-600/70">
            {ultima.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </button>
    </>
  )
}
