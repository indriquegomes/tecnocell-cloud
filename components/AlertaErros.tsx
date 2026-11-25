'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type Item = { id: string; tela: string | null; titulo: string }

// Aviso discreto no canto da tela quando alguma coisa quebrou — só para o master
// (o layout do painel só monta este componente para ele).
//
// Por que consultar de minuto em minuto em vez de tempo real: erro é raro, e um
// canal aberto o tempo todo custa mais do que vale. Um pedido por minuto é barato
// e o atraso de até 1 minuto não muda nada para quem está no balcão.
const INTERVALO_MS = 60_000
const CHAVE_DISPENSA = 'alerta-erros-dispensado'

export function AlertaErros() {
  const [itens, setItens] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    let vivo = true

    async function conferir() {
      try {
        const r = await fetch('/api/erros/novos', { cache: 'no-store' })
        if (!r.ok) return
        const dados = (await r.json()) as { n: number; itens: Item[] }
        if (!vivo || !dados.n || dados.itens.length === 0) return
        // Dispensa é por ocorrência: fechou este aviso, ele não volta até surgir
        // um problema NOVO (id diferente). Sem isso o alerta reapareceria a cada
        // minuto com a mesma ocorrência e viraria um incômodo.
        if (localStorage.getItem(CHAVE_DISPENSA) === dados.itens[0].id) return
        setItens(dados.itens)
        setTotal(dados.n)
        setVisivel(true)
      } catch {
        // painel funcionando > painel avisando
      }
    }

    conferir()
    const timer = setInterval(conferir, INTERVALO_MS)
    return () => {
      vivo = false
      clearInterval(timer)
    }
  }, [])

  function dispensar() {
    setVisivel(false)
    try {
      if (itens[0]) localStorage.setItem(CHAVE_DISPENSA, itens[0].id)
    } catch {}
  }

  if (!visivel) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 rounded-xl border border-red-200 bg-white p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-red-800">
          {total === 1 ? '1 problema na última hora' : total + ' problemas na última hora'}
        </p>
        <button
          onClick={dispensar}
          aria-label="Fechar aviso"
          className="rounded px-1 text-lg leading-none text-gray-400 transition hover:text-gray-700"
        >
          ×
        </button>
      </div>

      <ul className="mt-2 space-y-1">
        {itens.map((i) => (
          <li key={i.id} className="text-xs text-gray-700">
            <span className="font-semibold">{i.tela ?? 'sem tela'}</span> — {i.titulo}
          </li>
        ))}
      </ul>

      <Link
        href="/painel/saude"
        onClick={dispensar}
        className="mt-3 inline-block rounded-lg bg-[#1B6CA8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#155a8f]"
      >
        Ver na Saúde do sistema
      </Link>
    </div>
  )
}
