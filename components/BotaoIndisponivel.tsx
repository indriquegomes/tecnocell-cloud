'use client'
import { useState } from 'react'

// Botao reutilizavel pra qualquer acao de integracao que ainda nao existe
// de verdade (Conectar, Adicionar Loja, Adicionar Integracao...). Nunca
// finge que funciona -- avisa e para ai. Cada instancia tem seu proprio
// estado, entao varios cards na mesma tela nao se atrapalham.
export function BotaoIndisponivel({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  const [avisado, setAvisado] = useState(false)

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setAvisado(true)}
        className={className ?? 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition'}
      >
        {label}
      </button>
      {avisado && (
        <p className="text-xs font-medium text-amber-600">
          Integração ainda não disponível — em construção.
        </p>
      )}
    </div>
  )
}
