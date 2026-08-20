'use client'

import { useState } from 'react'
import { responderMensagem } from './actions'

export function ResponderMensagemForm({ packId }: { packId: string }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro('')
    const res = await responderMensagem(packId, texto)
    if (!res.ok) setErro(res.erro ?? 'Erro ao enviar.')
    else setTexto('')
    setEnviando(false)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-start gap-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva a resposta..."
        rows={2}
        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
      />
      <button type="submit" disabled={enviando}
        className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
        {enviando ? 'Enviando...' : 'Responder'}
      </button>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </form>
  )
}
