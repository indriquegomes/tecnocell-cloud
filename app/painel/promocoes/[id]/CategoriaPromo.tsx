'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/components/Spinner'
import { adicionarCategoriaPromocao, contarCategoriaPromocao } from '../actions'

// Pedido da Isa: promoção de PELÍCULA sem catar as 327 películas na mão.
//
// A promoção continua guardando produto a produto — a lógica de preço do PDV não muda
// (é dinheiro; não mexo nela por conveniência de cadastro). O que muda é o CADASTRO.
//
// Como é uma FOTOGRAFIA, produto novo cadastrado depois não entra sozinho — por isso a
// tela AVISA quando surgem novos e deixa incluir com um clique.
export function CategoriaPromo({
  promocaoId,
  categorias,
  categoriaAtual,
  faltamNaCategoria,
  nomeCategoriaAtual,
}: {
  promocaoId: string
  categorias: { hierarquia: string; nome: string; total: number }[]
  categoriaAtual: string | null
  faltamNaCategoria: number
  nomeCategoriaAtual: string | null
}) {
  const [escolhida, setEscolhida] = useState(categoriaAtual ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const cat = categorias.find((c) => c.hierarquia === escolhida)

  const adicionar = () => {
    if (!escolhida) return
    startTransition(async () => {
      const n = await adicionarCategoriaPromocao(promocaoId, escolhida)
      setMsg(n === 0 ? 'Todos os produtos desta categoria já estavam na promoção.' : `${n} produto${n > 1 ? 's' : ''} adicionado${n > 1 ? 's' : ''}.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-800">Adicionar uma Categoria Inteira</h3>
        <p className="mt-0.5 text-xs text-gray-400">
          Em vez de buscar produto por produto: escolha a categoria e o sistema joga todos de uma vez.
        </p>
      </div>

      {/* Produto novo entrou na categoria depois? Avisa, porque a promoção é uma foto. */}
      {categoriaAtual && faltamNaCategoria > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>
            <b>{faltamNaCategoria}</b> produto{faltamNaCategoria > 1 ? 's' : ''} novo{faltamNaCategoria > 1 ? 's' : ''} em{' '}
            <b>{nomeCategoriaAtual}</b> ainda não {faltamNaCategoria > 1 ? 'estão' : 'está'} nesta promoção.
          </span>
          <button
            type="button"
            disabled={pendente}
            onClick={() => { setEscolhida(categoriaAtual); adicionar() }}
            className="ml-auto rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 transition disabled:opacity-50"
          >
            Incluir agora
          </button>
        </div>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="cat_promo" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            Categoria
          </label>
          <select
            id="cat_promo"
            value={escolhida}
            onChange={(e) => { setEscolhida(e.target.value); setMsg(null) }}
            className="field w-full"
          >
            <option value="">Escolha uma categoria…</option>
            {categorias.map((c) => (
              <option key={c.hierarquia} value={c.hierarquia}>
                {c.nome} — {c.total} produto{c.total !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            {cat
              ? `Vai adicionar os ${cat.total} produtos ativos de ${cat.nome} que ainda não estiverem aqui.`
              : 'Só entram produtos ativos.'}
          </p>
        </div>

        <div>
          <span aria-hidden className="mb-1.5 block text-xs font-semibold uppercase invisible">x</span>
          <button
            type="button"
            disabled={!escolhida || pendente}
            onClick={adicionar}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-50 sm:w-auto"
          >
            {pendente && <Spinner className="h-3.5 w-3.5" />}
            {pendente ? 'Adicionando...' : 'Adicionar categoria'}
          </button>
        </div>
      </div>

      {msg && <p className="text-sm font-medium text-green-600">✓ {msg}</p>}
    </div>
  )
}
