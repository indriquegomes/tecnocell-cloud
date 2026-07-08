'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarProdutosEstoque } from '../actions'

// Busca de produto SOB DEMANDA pro form de movimentação (não embute os 7.983 num
// datalist). Digita → consulta servidor (debounce) → escolhe → grava id + nome.
const supabaseBrowser = createClient()

export function BuscaProdutoMov({ initialNome = '', initialId = '' }: { initialNome?: string; initialId?: string }) {
  const [nome, setNome] = useState(initialNome)
  const [id, setId] = useState(initialId)
  const [resultados, setResultados] = useState<{ id: string; nome: string; codigo: string | null }[]>([])
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const digitou = useRef(false)

  useEffect(() => {
    if (!digitou.current) return          // não busca no valor inicial (pré-preenchido)
    const termo = nome.trim()
    if (termo.length < 1) { setResultados([]); setBuscando(false); return }
    setBuscando(true)
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const { data } = await supabaseBrowser.auth.getSession()
        const achados = await buscarProdutosEstoque(data.session?.access_token ?? '', termo)
        if (vivo) { setResultados(achados); setAberto(true) }
      } catch { /* silencioso */ }
      finally { if (vivo) setBuscando(false) }
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [nome])

  return (
    <div className="relative">
      <input type="hidden" name="produto_id" value={id} />
      <input
        name="produto_busca"
        required
        autoComplete="off"
        value={nome}
        onChange={(e) => { digitou.current = true; setNome(e.target.value); setId('') }}
        onFocus={() => resultados.length && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder="Pesquise pelo nome ou código do produto"
        className="field"
      />
      {aberto && nome.trim().length >= 1 && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {buscando && resultados.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">Buscando…</div>
          ) : resultados.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">Nenhum produto encontrado.</div>
          ) : resultados.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setNome(p.nome); setId(p.id); setAberto(false); digitou.current = false }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-blue-50 transition"
            >
              <span className="font-medium text-gray-800">{p.nome}</span>
              {p.codigo && <span className="text-xs text-gray-400">{p.codigo}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
