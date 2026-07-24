'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { iniciarPonto, pararPonto } from '@/app/painel/ponto/actions'

type Colega = { nome: string; entrada: string }

const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`
}

function Relogio({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
      <path strokeLinecap="round" strokeWidth={1.8} d="M12 7v5l3 2" />
    </svg>
  )
}

export function PontoWidget({
  nome, emOperacaoDesde, horasFechadasHojeMs, colegas,
}: {
  nome: string
  emOperacaoDesde: string | null
  horasFechadasHojeMs: number
  colegas: Colega[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const emOperacao = !!emOperacaoDesde

  // relógio ao vivo só quando precisa (modal aberto ou em operação)
  useEffect(() => {
    if (!aberto) return
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [aberto])

  const elapsedMs = emOperacaoDesde ? Math.max(0, agora - new Date(emOperacaoDesde).getTime()) : 0
  const totalHojeMs = horasFechadasHojeMs + elapsedMs

  const acao = async (fn: () => Promise<{ ok: boolean; erro?: string }>) => {
    setProcessando(true); setErro(null)
    const r = await fn()
    setProcessando(false)
    if (!r.ok) { setErro(r.erro ?? 'Erro'); return }
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Ponto do dia"
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${emOperacao ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
      >
        <Relogio /> Ponto
        {emOperacao && <span className="ml-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
      </button>

      {aberto && (
        <div className="animate-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setAberto(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="flex items-center gap-2 text-base font-bold text-gray-900"><Relogio className="h-5 w-5 text-[#1B6CA8]" /> Ponto do dia</h3>
              <button type="button" onClick={() => setAberto(false)} className="text-lg text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <p className="text-center text-sm font-bold uppercase tracking-wide text-gray-800">{nome || 'Você'}</p>

              {/* Horas do dia */}
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Horas hoje</p>
                <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">{fmtDur(totalHojeMs)}</p>
                {emOperacao && <p className="mt-0.5 text-[11px] text-emerald-600">🟢 em operação há {fmtDur(elapsedMs)}</p>}
              </div>

              {/* Iniciar / Parar */}
              {emOperacao ? (
                <button type="button" disabled={processando} onClick={() => acao(pararPonto)}
                  className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-50">
                  {processando ? 'Parando…' : '⏹ Parar'}
                </button>
              ) : (
                <button type="button" disabled={processando} onClick={() => acao(iniciarPonto)}
                  className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                  {processando ? 'Iniciando…' : '▶ Iniciar'}
                </button>
              )}

              {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}

              {/* Colegas em operação (minimalista) */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Em operação agora</p>
                {colegas.length === 0 ? (
                  <p className="text-xs text-gray-400">Ninguém mais no ponto.</p>
                ) : (
                  <div className="space-y-1">
                    {colegas.map((c, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-emerald-50/60 px-2.5 py-1.5">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {c.nome}
                        </span>
                        <span className="text-[11px] tabular-nums text-gray-400">há {fmtDur(agora - new Date(c.entrada).getTime())}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
