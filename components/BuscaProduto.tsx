'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buscarProdutosEstoque } from '@/app/painel/estoque/actions'

// BUSCA DE PRODUTO — PADRÃO DO SISTEMA (o mesmo jeito do PDV).
//
// Por que existe: várias telas montavam um <datalist> com uma lista de produtos
// CAPADA (.limit(500) / .limit(1000)) vinda do servidor. Como são 8.034 produtos,
// o que não estava nos primeiros N em ordem alfabética simplesmente NÃO APARECIA —
// digitar "pelicula" ou "frontal" não achava nada (bug real relatado pela Isa).
//
// Aqui a busca vai ao servidor conforme digita: casa PALAVRA A PALAVRA, em qualquer
// ordem, sem acento (produtos.busca_norm). "pel a15" acha "PELICULA 3D SAMSUNG A15".
//
// Use este componente em qualquer tela que precise escolher um produto.

export type ProdutoBusca = { id: string; nome: string; codigo: string | null; controla_serie: boolean; ean: string | null; preco: number }

const supabaseBrowser = createClient()

/** Rótulo padrão do produto no campo: "NOME (CODIGO)" — o mesmo que os forms já esperavam. */
export function rotuloProduto(p: { nome: string; codigo: string | null }) {
  return p.nome + (p.codigo ? ` (${p.codigo})` : '')
}

export function BuscaProduto({
  valor,
  onChange,
  onSelecionar,
  onAchados,
  placeholder = 'Pesquise por nome ou código (ex: pel a15, frontal iphone 11)',
  autoFocus = false,
  onEnter,
  inputRef,
  name,
  required = false,
}: {
  /** texto do campo (controlado pelo form que usa) */
  valor: string
  /** o usuário digitou */
  onChange: (texto: string) => void
  /** o usuário escolheu um produto da lista */
  onSelecionar?: (p: ProdutoBusca) => void
  /** resultados brutos da busca — útil pro form saber controla_serie etc. */
  onAchados?: (ps: ProdutoBusca[]) => void
  placeholder?: string
  autoFocus?: boolean
  /** Enter com o dropdown fechado (ex: adicionar item) */
  onEnter?: () => void
  inputRef?: React.RefObject<HTMLInputElement | null>
  /** name do campo (forms que submetem o texto pro servidor, ex: produto_busca) */
  name?: string
  required?: boolean
}) {
  const [achados, setAchados] = useState<ProdutoBusca[]>([])
  const [aberto, setAberto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const digitou = useRef(false)

  useEffect(() => {
    if (!digitou.current) return          // não busca no valor pré-preenchido
    const termo = valor.trim()
    if (termo.length < 1) { setAchados([]); onAchados?.([]); setBuscando(false); return }
    setBuscando(true)
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const { data } = await supabaseBrowser.auth.getSession()
        const res = await buscarProdutosEstoque(data.session?.access_token ?? '', termo)
        if (vivo) { setAchados(res); onAchados?.(res); setAberto(true) }
      } catch { if (vivo) { setAchados([]); onAchados?.([]) } }
      finally { if (vivo) setBuscando(false) }
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        name={name}
        required={required}
        value={valor}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        className="field"
        onChange={(e) => { digitou.current = true; onChange(e.target.value) }}
        onFocus={() => achados.length && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); setAberto(false); onEnter?.() }
          if (e.key === 'Escape') setAberto(false)
        }}
      />
      {aberto && valor.trim().length >= 1 && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {buscando && achados.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">Buscando…</div>
          ) : achados.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">Nenhum produto encontrado.</div>
          ) : achados.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                digitou.current = false
                onChange(rotuloProduto(p))
                onSelecionar?.(p)
                setAberto(false)
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-blue-50 transition"
            >
              <span className="font-medium text-gray-800">{p.nome}</span>
              {p.codigo && <span className="shrink-0 text-xs text-gray-400">{p.codigo}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
