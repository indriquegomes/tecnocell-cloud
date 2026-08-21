'use client'

import { useState } from 'react'
import { IconPlus } from '@/components/icons'
import { PLATAFORMAS } from '@/lib/integracoes'

// Botão "+ Adicionar Loja": abre a lista de plataformas. Mercado Livre manda
// pro OAuth de verdade; as outras ainda não existem — clicar avisa e não
// finge que funciona (mesma regra do resto da Central de Integrações).
export function AdicionarLojaDropdown() {
  const [aberto, setAberto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setAberto((v) => !v); setAviso(null) }}
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
      >
        <IconPlus className="h-4 w-4" /> Adicionar Loja
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-2 shadow-lg">
            {PLATAFORMAS.map((p) => (
              p.chave === 'mercado-livre' ? (
                <a key={p.chave} href="/painel/integracoes/lojas/nova"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  {p.nome}
                </a>
              ) : (
                <button key={p.chave} type="button"
                  onClick={() => { setAviso(p.nome); setAberto(false) }}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  {p.nome}
                </button>
              )
            ))}
          </div>
        </>
      )}

      {aviso && (
        <p className="absolute right-0 top-full mt-2 w-64 text-xs font-medium text-amber-600">
          {aviso}: integração ainda não disponível — em construção.
        </p>
      )}
    </div>
  )
}
