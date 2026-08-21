'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { desconectarMercadoLivre } from './actions'

export function DesconectarBotao({ conexaoId }: { conexaoId: string }) {
  const router = useRouter()
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const handleClick = async () => {
    // Botão fica ao lado de "Importar Anúncios" no cabeçalho, visível em
    // qualquer aba — sem essa confirmação, um clique errado apaga a conexão
    // (os dois tokens juntos), só recuperável logando no Mercado Livre de novo.
    if (!confirm('Desconectar esta loja? Você vai precisar logar no Mercado Livre de novo pra reconectar.')) return
    setCarregando(true)
    setErro('')
    try {
      const res = await desconectarMercadoLivre(conexaoId)
      if (res.ok) {
        // A página atual é dessa conexão, que acabou de deixar de existir —
        // ficar aqui e só dar refresh() levaria a um 404.
        router.push('/painel/integracoes/lojas')
        return
      }
      setErro(res.erro ?? 'Erro ao desconectar.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao desconectar — tente de novo.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={handleClick} disabled={carregando}
        className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 transition">
        {carregando ? 'Desconectando...' : 'Desconectar'}
      </button>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  )
}
