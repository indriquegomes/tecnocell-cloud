'use client'

import { useState } from 'react'

// Botão que lança meta + comissão da loja como contas a pagar.
// Mostra o que vai fazer antes de fazer: valor por pessoa e a data de cada um.
export function BotaoLancarComissao({
  lojaId,
  mes,
  vendedoras,
  metaCada,
  comissaoCada,
  jaLancado,
  rotuloMeta,
}: {
  lojaId: string
  mes: string
  vendedoras: string[]
  metaCada: number
  comissaoCada: number
  jaLancado: boolean
  rotuloMeta: string | null
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  if (jaLancado) {
    return <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">✓ Já lançado em Contas a Pagar</span>
  }
  if (vendedoras.length === 0 || (metaCada <= 0 && comissaoCada <= 0)) return null

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function lancar() {
    const ok = confirm(
      `Lançar para ${vendedoras.length} vendedoras de ${mes}?\n\n` +
      (metaCada > 0 ? `Meta: ${vendedoras.length} × ${fmt(metaCada)}\n` : '') +
      (comissaoCada > 0 ? `Comissão: ${vendedoras.length} × ${fmt(comissaoCada)}\n` : '') +
      '\nVai criar contas a pagar em PENDENTE. Nada é pago agora.',
    )
    if (!ok) return
    setEnviando(true)
    setErro('')
    try {
      const fd = new FormData()
      fd.set('mes', mes)
      fd.set('loja_id', lojaId)
      fd.set('vendedoras', vendedoras.join('|'))
      fd.set('meta_cada', String(metaCada))
      fd.set('comissao_cada', String(comissaoCada))
      if (rotuloMeta) fd.set('rotulo_meta', rotuloMeta)
      const { lancarComissaoDoMes } = await import('./actions')
      await lancarComissaoDoMes(fd)
      window.location.reload()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao lançar')
      setEnviando(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {erro && <span className="text-xs text-red-600">{erro}</span>}
      <button
        type="button"
        onClick={lancar}
        disabled={enviando}
        className="rounded-lg bg-[#1B6CA8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#155a8a] disabled:opacity-60"
      >
        {enviando ? 'Lançando…' : 'Lançar meta e comissão'}
      </button>
    </div>
  )
}
