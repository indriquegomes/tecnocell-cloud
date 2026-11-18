'use client'

import { useEffect, useRef, useState } from 'react'
import { buscarProdutosNota } from '../actions'

// Escolher o produto de UMA linha da nota.
//
// Antes era um <select> com o catálogo inteiro (8.177 opções) em cada linha sem
// casamento — impossível de achar e pesado na página. Agora é campo de busca:
// digita, o servidor devolve no máximo 12 (já filtrados pela classe da nota) e
// ela clica. Se o campo ficar vazio e nada for escolhido, a linha continua
// pendente e a nota não é criada — melhor do que entrar peça errada.
export function EscolherProduto({
  nomeCampo,
  idInicial,
  nomeInicial,
  classe,
  onEscolher,
}: {
  nomeCampo: string
  idInicial?: string | null
  nomeInicial?: string | null
  classe: string
  onEscolher: (id: string) => void
}) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<{ id: string; nome: string }[]>([])
  const [buscando, setBuscando] = useState(false)
  const [escolhido, setEscolhido] = useState<{ id: string; nome: string } | null>(
    nomeInicial ? { id: idInicial ?? '', nome: nomeInicial } : null,
  )
  const [idEscolhido, setIdEscolhido] = useState(idInicial ?? '')
  const [vazio, setVazio] = useState(false)
  const pedido = useRef(0)

  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2) { setResultados([]); setVazio(false); return }
    const meu = ++pedido.current
    setBuscando(true)
    const timer = setTimeout(async () => {
      try {
        const r = await buscarProdutosNota(t, classe || null)
        if (meu !== pedido.current) return
        setResultados(r)
        setVazio(r.length === 0)
      } catch {
        if (meu === pedido.current) { setResultados([]); setVazio(true) }
      } finally {
        if (meu === pedido.current) setBuscando(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [termo, classe])

  const escolher = (p: { id: string; nome: string }) => {
    setEscolhido(p)
    setIdEscolhido(p.id)
    onEscolher(p.id)
    setResultados([])
    setTermo('')
  }

  return (
    <div className="space-y-1">
      <input type="hidden" name={nomeCampo} value={idEscolhido} />
      {escolhido ? (
        <div className="flex items-start gap-2">
          <span className="text-sm font-medium text-gray-800">{escolhido.nome}</span>
          <button
            type="button"
            onClick={() => { setEscolhido(null); setIdEscolhido(''); onEscolher('') }}
            className="text-xs text-blue-600 hover:underline"
          >
            trocar
          </button>
        </div>
      ) : (
        <>
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Digite o modelo ou o código (ex: a15, 13 jk)"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {buscando && <p className="text-xs text-gray-400">buscando…</p>}
          {resultados.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-sm">
              {resultados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => escolher(p)}
                  className="block w-full px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-blue-50"
                >
                  {p.nome}
                </button>
              ))}
            </div>
          )}
          {vazio && !buscando && (
            <p className="text-xs text-amber-700">
              Nada com esse nome{classe ? ' nessa classe' : ''}. Cadastre a peça em Produtos e volte —
              ou lance esta linha depois.
            </p>
          )}
        </>
      )}
    </div>
  )
}
