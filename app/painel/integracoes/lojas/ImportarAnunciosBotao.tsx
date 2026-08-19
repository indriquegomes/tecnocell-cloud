'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { importarAnuncios } from './actions'

export function ImportarAnunciosBotao() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const handleClick = async () => {
    setCarregando(true)
    setMensagem('')
    const res = await importarAnuncios()
    setMensagem(
      res.ok
        ? `${res.casados} anúncio(s) casado(s) com produto, ${res.semCorrespondencia} sem correspondência.`
        : res.erro ?? 'Erro ao importar.'
    )
    setCarregando(false)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <button onClick={handleClick} disabled={carregando}
        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
        {carregando ? 'Importando...' : 'Importar Anúncios'}
      </button>
      {mensagem && <p className="text-sm text-gray-600">{mensagem}</p>}
    </div>
  )
}
