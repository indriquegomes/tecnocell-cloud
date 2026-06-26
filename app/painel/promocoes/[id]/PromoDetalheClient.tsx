'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  buscarProdutosPromocao, adicionarItemPromocao,
  removerItemPromocao, togglePromocao, deletarPromocao,
} from '../actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TIPO_LABEL: Record<string, string> = {
  valor_direto: 'Valor Direto',
  leve_x_pague_y: 'Leve X Pague Y',
  acima_x_pague_y: 'Acima de X un. Pague Y',
}

type ItemPromo = {
  id: string
  produto_id: string
  nome_produto: string
  preco_padrao: number
  preco_promocional: number | null
  quantidade_x: number | null
  quantidade_y: number | null
}

type Promocao = {
  id: string
  nome: string
  tipo: string
  valor: number
  data_inicio: string
  data_fim: string
  ativa: boolean
  descricao: string | null
  quantidade_x: number | null
  quantidade_y: number | null
}

export function PromoDetalheClient({
  promocao,
  itens,
}: {
  promocao: Promocao
  itens: ItemPromo[]
}) {
  const router = useRouter()
  const hoje = new Date().toISOString().split('T')[0]
  const expirada = promocao.data_fim < hoje
  const ativa = promocao.ativa && !expirada

  const [busca, setBusca] = useState('')
  const [sugestoes, setSugestoes] = useState<{ id: string; nome: string; preco: number }[]>([])
  const [precoTemp, setPrecoTemp] = useState('')
  const [qxTemp, setQxTemp] = useState('3')
  const [qyTemp, setQyTemp] = useState('2')
  const [prodSel, setProdSel] = useState<{ id: string; nome: string; preco: number } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState<string | null>(null)

  useEffect(() => {
    const q = busca.trim()
    if (!q || prodSel) { setSugestoes([]); return }
    const t = setTimeout(async () => setSugestoes(await buscarProdutosPromocao(q)), 250)
    return () => clearTimeout(t)
  }, [busca, prodSel])

  const handleAdicionar = async () => {
    if (!prodSel) return
    setSalvando(true)
    await adicionarItemPromocao(
      promocao.id,
      prodSel.id,
      promocao.tipo === 'valor_direto' ? (parseFloat(precoTemp) || prodSel.preco) : prodSel.preco,
      null,
      null,
    )
    setBusca(''); setProdSel(null); setPrecoTemp(''); setSalvando(false)
    router.refresh()
  }

  const handleRemover = async (itemId: string) => {
    setRemovendo(itemId)
    await removerItemPromocao(itemId, promocao.id)
    setRemovendo(null)
    router.refresh()
  }

  const handleToggle = async () => {
    await togglePromocao(promocao.id, promocao.ativa)
    router.refresh()
  }

  const handleDeletar = async () => {
    if (!confirm('Excluir esta promoção?')) return
    await deletarPromocao(promocao.id)
  }

  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{promocao.nome}</h2>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold
              ${ativa ? 'bg-green-100 text-green-700' : expirada ? 'bg-gray-100 text-gray-400' : 'bg-yellow-100 text-yellow-700'}`}>
              {ativa ? 'Ativa' : expirada ? 'Expirada' : 'Pausada'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {TIPO_LABEL[promocao.tipo] ?? promocao.tipo}
            {promocao.tipo === 'leve_x_pague_y' && promocao.quantidade_x && promocao.quantidade_y &&
              ` · Leve ${promocao.quantidade_x} Pague ${promocao.quantidade_y}`}
            {promocao.tipo === 'acima_x_pague_y' && promocao.quantidade_x &&
              ` · Acima de ${promocao.quantidade_x} un. por ${fmt(promocao.valor)}/un.`}
            {' · '}{fmtDate(promocao.data_inicio)} até {fmtDate(promocao.data_fim)}
          </p>
          {promocao.descricao && <p className="mt-0.5 text-xs text-gray-400">{promocao.descricao}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {!expirada && (
            <button onClick={handleToggle}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
              {promocao.ativa ? 'Pausar' : 'Ativar'}
            </button>
          )}
          <button onClick={handleDeletar}
            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition">
            Excluir
          </button>
        </div>
      </div>

      {/* Adicionar produto */}
      {!expirada && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 font-semibold text-gray-800">Adicionar Produto</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-48">
              <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">Produto</label>
              <input value={busca} onChange={e => { setBusca(e.target.value); if (prodSel) setProdSel(null) }}
                placeholder="Buscar produto..." className="field w-full" />
              {sugestoes.length > 0 && !prodSel && (
                <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
                  {sugestoes.map(p => (
                    <button key={p.id} type="button"
                      onMouseDown={e => { e.preventDefault(); setProdSel(p); setBusca(p.nome); setSugestoes([]); setPrecoTemp(String(p.preco)) }}
                      className="flex w-full justify-between px-4 py-2.5 text-sm hover:bg-blue-50 text-left">
                      <span className="font-medium text-gray-800">{p.nome}</span>
                      <span className="text-xs text-blue-600">{fmt(p.preco)}</span>
                    </button>
                  ))}
                </div>
              )}
              {prodSel && <p className="mt-1 text-xs text-green-600">✓ Preço padrão: {fmt(prodSel.preco)}</p>}
            </div>

            {promocao.tipo === 'valor_direto' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-400">Preço Promocional</label>
                <input value={precoTemp} onChange={e => setPrecoTemp(e.target.value)}
                  type="number" step="0.01" min="0" placeholder="0,00" className="field w-32" />
              </div>
            )}

            {promocao.tipo !== 'valor_direto' && (
              <p className="text-xs text-gray-400 self-end pb-2.5">
                Condição: {promocao.tipo === 'leve_x_pague_y'
                  ? `Leve ${promocao.quantidade_x} Pague ${promocao.quantidade_y} (definido na promoção)`
                  : `Acima de ${promocao.quantidade_x} un. por R$ ${promocao.valor} (definido na promoção)`}
              </p>
            )}

            <button onClick={handleAdicionar} disabled={!prodSel || salvando}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition">
              {salvando ? 'Adicionando...' : '+ Adicionar'}
            </button>
          </div>
        </div>
      )}

      {/* Tabela de produtos */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Produtos na Promoção</h3>
          <span className="text-xs text-gray-400">{itens.length} produto{itens.length !== 1 ? 's' : ''}</span>
        </div>
        {itens.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Nenhum produto adicionado ainda.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-6 py-3">Produto</th>
                <th className="px-6 py-3 text-right">Preço Padrão</th>
                {promocao.tipo === 'valor_direto' && <th className="px-6 py-3 text-right">Preço Promo</th>}
                {promocao.tipo === 'valor_direto' && <th className="px-6 py-3 text-right">Desconto</th>}
                {promocao.tipo !== 'valor_direto' && <th className="px-6 py-3 text-center">Condição</th>}
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map(item => {
                const desconto = item.preco_padrao && item.preco_promocional
                  ? ((item.preco_padrao - item.preco_promocional) / item.preco_padrao * 100)
                  : 0
                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-800">{item.nome_produto}</td>
                    <td className="px-6 py-3 text-right text-gray-500">{fmt(item.preco_padrao)}</td>
                    {promocao.tipo === 'valor_direto' && (
                      <>
                        <td className="px-6 py-3 text-right font-bold text-green-600">
                          {item.preco_promocional != null ? fmt(item.preco_promocional) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right text-orange-500">
                          {desconto > 0 ? `-${desconto.toFixed(0)}%` : '—'}
                        </td>
                      </>
                    )}
                    {promocao.tipo !== 'valor_direto' && (
                      <td className="px-6 py-3 text-center text-gray-600">
                        {promocao.tipo === 'leve_x_pague_y'
                          ? `Leve ${promocao.quantidade_x} Pague ${promocao.quantidade_y}`
                          : `Acima de ${promocao.quantidade_x} un.`}
                      </td>
                    )}
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => handleRemover(item.id)} disabled={removendo === item.id}
                        className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-40">
                        {removendo === item.id ? '...' : 'Remover'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
