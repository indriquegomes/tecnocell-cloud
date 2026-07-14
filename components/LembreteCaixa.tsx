'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Lembrete } from '@/lib/lembrete-caixa'

// Barra fina abaixo do header. Discreta quando é só lembrete, firme quando o caixa
// virou a noite aberto. Dá pra dispensar — mas volta na próxima navegação, porque o
// caixa continua aberto e o ponto é justamente não deixar esquecer.
export function LembreteCaixa({ lembretes }: { lembretes: Lembrete[] }) {
  const [fechado, setFechado] = useState(false)
  if (fechado || lembretes.length === 0) return null

  // o mais grave manda no tom da barra
  const pior = lembretes.some((l) => l.urgencia === 'ontem')
    ? 'ontem'
    : lembretes.some((l) => l.urgencia === 'atrasado')
      ? 'atrasado'
      : 'lembrete'

  const estilo =
    pior === 'ontem'    ? 'border-red-200 bg-red-50 text-red-800'
    : pior === 'atrasado' ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-blue-100 bg-blue-50 text-blue-800'

  const icone = pior === 'ontem' ? '🔴' : pior === 'atrasado' ? '⏰' : '🔔'

  const texto = (l: Lembrete) => {
    if (l.urgencia === 'ontem') {
      const d = new Date(l.abertoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
      return <><b>{l.loja}</b> está com o caixa aberto desde <b>{d}</b> — não foi fechado.</>
    }
    if (l.urgencia === 'atrasado') {
      const h = Math.floor(l.minutosDesde / 60)
      const m = l.minutosDesde % 60
      const atraso = h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`
      return <><b>{l.loja}</b> passou <b>{atraso}</b> do horário de fechar o caixa ({l.horaLimite}).</>
    }
    return <>Hora de fechar o caixa de <b>{l.loja}</b> — são {l.horaLimite}.</>
  }

  return (
    <div className={`flex items-center gap-3 border-b px-6 py-2 text-sm ${estilo}`}>
      <span className="shrink-0">{icone}</span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {lembretes.map((l) => (
          <p key={l.caixaId} className="truncate">{texto(l)}</p>
        ))}
      </div>
      <Link
        href="/painel/pdv/operacao"
        className="shrink-0 rounded-lg bg-white/70 px-3 py-1 text-xs font-semibold hover:bg-white transition"
      >
        Fechar caixa →
      </Link>
      <button
        type="button"
        onClick={() => setFechado(true)}
        aria-label="Dispensar aviso"
        className="shrink-0 text-lg leading-none opacity-40 hover:opacity-70 transition"
      >
        ✕
      </button>
    </div>
  )
}
