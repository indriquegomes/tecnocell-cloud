'use client'

import { useEffect, useState } from 'react'
import VelocimetroMeta from './VelocimetroMeta'
import { buscarMinhaVenda } from './actions'

// Ligação entre os dados reais e o componente visual. Recebe a meta e o
// vendido do servidor, busca o vendido atualizado a cada 60s (pra pegar a
// venda feita no PDV sem recarregar) e repassa o percentual pro VelocimetroMeta.
export function MetaVelocimetro({
  meta,
  vendido,
  rotulo,
}: {
  meta: number
  vendido: number
  rotulo: string
}) {
  const [real, setReal] = useState(vendido)

  useEffect(() => {
    const id = setInterval(() => buscarMinhaVenda().then(setReal).catch(() => {}), 60000)
    return () => clearInterval(id)
  }, [])

  if (meta <= 0) {
    return (
      <div className="max-w-[480px] rounded-3xl border border-gray-200 bg-white px-5 py-8 text-center">
        <p className="text-sm font-semibold text-gray-800">{rotulo}</p>
        <p className="mt-2 text-xs text-gray-500">Sem meta definida — peça pro gerente configurar.</p>
      </div>
    )
  }

  const pct = Math.min(100, (real / meta) * 100)
  const falta = Math.max(0, meta - real)
  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return <VelocimetroMeta pct={pct} rotulo={rotulo} falta={fmtBRL(falta)} />
}
