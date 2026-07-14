'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { marcarFeito } from '@/app/painel/lembretes/actions'
import type { Lembrete as LembreteCaixa } from '@/lib/lembrete-caixa'
import type { LembretePendente } from '@/lib/lembretes'

const supabaseBrowser = createClient()

// Barra fina abaixo do header, com os dois tipos de aviso:
//
//  CAIXA  — o sistema descobre sozinho (status='aberto' passou da hora). Não tem
//           "Feito": ele some quando o caixa fecha de verdade.
//  ROTINA — o que a Isa cadastrou ("Duda conferir caixa 18:30"). Só some quando a
//           pessoa clica em FEITO — é o que separa isto de um alarme que se ignora.
export function BarraAvisos({
  caixas = [],
  rotinas = [],
}: {
  caixas?: LembreteCaixa[]
  rotinas?: LembretePendente[]
}) {
  const [dispensados, setDispensados] = useState<Set<string>>(new Set())
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const cx = caixas.filter((c) => !dispensados.has(c.caixaId))
  const rt = rotinas.filter((r) => !dispensados.has(r.id))
  if (cx.length === 0 && rt.length === 0) return null

  const dispensar = (id: string) => setDispensados((s) => new Set(s).add(id))

  const feito = (id: string) => {
    startTransition(async () => {
      const { data } = await supabaseBrowser.auth.getSession()
      await marcarFeito(data.session?.access_token ?? '', id)
      dispensar(id)
      router.refresh()
    })
  }

  const grave = cx.some((c) => c.urgencia === 'ontem')
  const tom = grave
    ? 'border-red-200 bg-red-50'
    : cx.some((c) => c.urgencia === 'atrasado') || rt.some((r) => r.atrasado)
      ? 'border-amber-200 bg-amber-50'
      : 'border-blue-100 bg-blue-50'

  const atraso = (min: number) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`
  }

  return (
    <div className={`space-y-1 border-b px-6 py-2 ${tom}`}>
      {cx.map((c) => (
        <div key={c.caixaId} className="flex items-center gap-3 text-sm">
          <span className="shrink-0">{c.urgencia === 'ontem' ? '🔴' : c.urgencia === 'atrasado' ? '⏰' : '🔔'}</span>
          <p className={`min-w-0 flex-1 truncate ${c.urgencia === 'ontem' ? 'text-red-800' : 'text-amber-800'}`}>
            {c.urgencia === 'ontem' ? (
              <><b>{c.loja}</b> está com o caixa aberto desde{' '}
                <b>{new Date(c.abertoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })}</b> — não foi fechado.</>
            ) : c.urgencia === 'atrasado' ? (
              <><b>{c.loja}</b> passou <b>{atraso(c.minutosDesde)}</b> do horário de fechar o caixa ({c.horaLimite}).</>
            ) : (
              <>Hora de fechar o caixa de <b>{c.loja}</b> — são {c.horaLimite}.</>
            )}
          </p>
          <Link href="/painel/pdv/operacao"
            className="shrink-0 rounded-lg bg-white/70 px-3 py-1 text-xs font-semibold hover:bg-white transition">
            Fechar caixa →
          </Link>
          <button type="button" onClick={() => dispensar(c.caixaId)} aria-label="Dispensar aviso"
            className="shrink-0 text-lg leading-none opacity-40 hover:opacity-70 transition">✕</button>
        </div>
      ))}

      {rt.map((r) => (
        <div key={r.id} className="flex items-center gap-3 text-sm">
          <span className="shrink-0">{r.atrasado ? '⏰' : '🔔'}</span>
          <p className={`min-w-0 flex-1 truncate ${r.atrasado ? 'text-amber-800' : 'text-blue-800'}`}>
            <b>{r.titulo}</b>
            {r.descricao && <span className="ml-1.5 opacity-70">— {r.descricao}</span>}
            <span className="ml-2 text-xs opacity-60">
              {r.atrasado ? `${atraso(r.minutosDesde)} atrasado (era ${r.hora})` : `desde ${r.hora}`}
            </span>
          </p>
          <button
            type="button"
            disabled={pendente}
            onClick={() => feito(r.id)}
            className="shrink-0 rounded-lg bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-white transition disabled:opacity-50"
          >
            ✓ Feito
          </button>
          {/* dispensar só tira da tela; o lembrete volta na próxima navegação até
              alguém marcar FEITO — que é o ponto */}
          <button type="button" onClick={() => dispensar(r.id)} aria-label="Dispensar aviso"
            className="shrink-0 text-lg leading-none opacity-40 hover:opacity-70 transition">✕</button>
        </div>
      ))}
    </div>
  )
}
