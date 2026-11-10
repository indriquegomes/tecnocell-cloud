'use client'

import { useEffect, useState } from 'react'
import VelocimetroMeta from './VelocimetroMeta'
import { buscarFaturamentoDaLoja } from './actions'

// Ligação entre os dados reais e o componente visual. Recebe a meta e o
// vendido do servidor, busca o vendido atualizado a cada 60s (pra pegar a
// venda feita no PDV sem recarregar) e repassa o percentual pro VelocimetroMeta.
export function MetaVelocimetro({
  meta,
  vendido,
  rotulo,
  faixas = [],
  diasRestantes = 0,
}: {
  meta: number
  vendido: number
  rotulo: string
  faixas?: { nome: string; valor: number; premio?: number }[]
  diasRestantes?: number
}) {
  const [real, setReal] = useState(vendido)

  useEffect(() => {
    const id = setInterval(() => buscarFaturamentoDaLoja().then((v) => { if (v > 0) setReal(v) }).catch(() => {}), 60000)
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

  // Duas medidas, de propósito:
  //   pctReal = quanto a loja já vendeu ÷ meta do topo (o número que mostra a verdade)
  //   pctNivel = onde o ponteiro está NA ESCADA: cada degrau ocupa um quarto do arco,
  //              então o ponteiro caminha até o símbolo da meta e para nele.
  const pctReal = Math.min(100, (real / meta) * 100)
  const degraus = [...faixas].sort((a, b) => a.valor - b.valor)
  const pctNivel = (() => {
    if (!degraus.length) return pctReal
    let anterior = 0
    for (let i = 0; i < degraus.length; i++) {
      const alvo = degraus[i].valor
      if (real < alvo) {
        const fatia = alvo > anterior ? (real - anterior) / (alvo - anterior) : 0
        return ((i + Math.max(0, Math.min(1, fatia))) / degraus.length) * 100
      }
      anterior = alvo
    }
    return 100
  })()

  return (
    <VelocimetroMeta
      pct={pctNivel}
      pctReal={pctReal}
      rotulo={rotulo}
      faixas={faixas}
      vendido={real}
      diasRestantes={diasRestantes}
    />
  )
}
