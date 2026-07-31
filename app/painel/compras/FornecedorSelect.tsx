'use client'

import { useState, useRef, useEffect, useMemo } from 'react'

// Fornecedor com barra de busca (Isa 29/07: o <select> de 97 fornecedores dificultava).
// Filtra em memória (a lista já vem do servidor) e envia o id em name="fornecedor_id".
export function FornecedorSelect({
  fornecedores,
  defaultId = '',
}: {
  fornecedores: { id: string; nome: string }[]
  defaultId?: string
}) {
  const inicial = fornecedores.find((f) => f.id === defaultId)
  const [id, setId] = useState(defaultId)
  const [texto, setTexto] = useState(inicial?.nome ?? '')
  const [aberto, setAberto] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const filtrados = useMemo(() => {
    const t = texto.trim().toLowerCase()
    const base = t ? fornecedores.filter((f) => f.nome.toLowerCase().includes(t)) : fornecedores
    return base.slice(0, 50)
  }, [texto, fornecedores])

  return (
    <div className="relative" ref={box}>
      <input type="hidden" name="fornecedor_id" value={id} />
      <input
        value={texto}
        autoComplete="off"
        placeholder="Buscar fornecedor…"
        onChange={(e) => { setTexto(e.target.value); setId(''); setAberto(true) }}
        onFocus={() => setAberto(true)}
        className="field"
      />
      {aberto && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {filtrados.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">Nenhum fornecedor</div>}
          {filtrados.map((f) => (
            <button key={f.id} type="button"
              onClick={() => { setId(f.id); setTexto(f.nome); setAberto(false) }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 transition">
              {f.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
