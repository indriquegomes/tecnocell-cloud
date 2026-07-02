'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  adicionarItemTabela,
  removerItemTabela,
  atualizarPrecoItem,
  importarTodosComMultiplicador,
  toggleTabela,
} from '../actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Item = {
  id: string
  produto_id: string
  preco: number
  quantidade_minima: number
  produtos: { id: string; nome: string; preco: number } | null
}

type Produto = { id: string; nome: string; preco: number }

export function TabelaDetalheClient({
  tabela,
  itens: itensIniciais,
  produtos,
}: {
  tabela: { id: string; nome: string; descricao: string | null; ativa: boolean }
  itens: Item[]
  produtos: Produto[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Estado local de itens para UX imediata
  const [itens, setItens] = useState(itensIniciais)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editValor, setEditValor] = useState('')

  // Adicionar produto
  const [buscaProd, setBuscaProd] = useState('')
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null)
  const [novoPreco, setNovoPreco] = useState('')
  const [novaQtdMin, setNovaQtdMin] = useState('1')
  const [adicionando, setAdicionando] = useState(false)

  // Importar em lote
  const [mostrarImportar, setMostrarImportar] = useState(false)
  const [multiplicador, setMultiplicador] = useState('1.00')
  const [importando, setImportando] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  // Busca nos itens da tabela
  const [buscaItens, setBuscaItens] = useState('')

  const produtosFiltrados = useMemo(() => {
    const q = buscaProd.toLowerCase().trim()
    if (!q) return []
    // não exclui produtos já na tabela — o mesmo produto pode ter várias faixas de qtd
    return produtos.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 8)
  }, [buscaProd, produtos])

  const itensFiltrados = useMemo(() => {
    const q = buscaItens.toLowerCase().trim()
    if (!q) return itens
    return itens.filter((i) => i.produtos?.nome.toLowerCase().includes(q))
  }, [buscaItens, itens])

  // Selecionar produto da busca
  const selecionarProduto = (p: Produto) => {
    setProdutoSelecionado(p)
    setBuscaProd(p.nome)
    setNovoPreco(p.preco?.toString() ?? '')
  }

  // Adicionar produto
  const [erroAdicionar, setErroAdicionar] = useState('')
  const handleAdicionar = async () => {
    if (!produtoSelecionado || !novoPreco) return
    setAdicionando(true)
    setErroAdicionar('')
    const fd = new FormData()
    fd.set('produto_id', produtoSelecionado.id)
    fd.set('preco', novoPreco)
    fd.set('quantidade_minima', novaQtdMin || '1')
    const res = await adicionarItemTabela(tabela.id, fd)
    if (res?.error) {
      setErroAdicionar(res.error)
    } else {
      setBuscaProd('')
      setProdutoSelecionado(null)
      setNovoPreco('')
      setNovaQtdMin('1')
      router.refresh()
    }
    setAdicionando(false)
  }

  // Remover item
  const handleRemover = (itemId: string) => {
    startTransition(async () => {
      setItens((prev) => prev.filter((i) => i.id !== itemId))
      await removerItemTabela(itemId, tabela.id)
      router.refresh()
    })
  }

  // Salvar edição de preço
  const handleSalvarEdicao = async (itemId: string) => {
    const novoVal = parseFloat(editValor)
    if (isNaN(novoVal) || novoVal < 0) return
    setItens((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, preco: novoVal } : i))
    )
    setEditandoId(null)
    await atualizarPrecoItem(itemId, tabela.id, novoVal)
    router.refresh()
  }

  // Importar em lote
  const handleImportar = async () => {
    const mult = parseFloat(multiplicador)
    if (isNaN(mult) || mult <= 0) return
    setImportando(true)
    setImportMsg('')
    try {
      const count = await importarTodosComMultiplicador(tabela.id, mult)
      setImportMsg(`${count} produto${count !== 1 ? 's' : ''} importado${count !== 1 ? 's' : ''} com sucesso.`)
      router.refresh()
    } catch {
      setImportMsg('Erro ao importar.')
    }
    setImportando(false)
  }

  // Toggle ativa
  const handleToggle = () => {
    startTransition(async () => {
      await toggleTabela(tabela.id, !tabela.ativa)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{tabela.nome}</h2>
          {tabela.descricao && <p className="text-sm text-gray-400 mt-0.5">{tabela.descricao}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${tabela.ativa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {tabela.ativa ? 'Ativa' : 'Inativa'}
          </span>
          <button
            onClick={handleToggle}
            disabled={isPending}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            {tabela.ativa ? 'Desativar' : 'Ativar'}
          </button>
          <button
            onClick={() => setMostrarImportar(true)}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Importar em lote
          </button>
        </div>
      </div>

      {/* Adicionar produto */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800">Adicionar Produto</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="relative flex-1 min-w-64">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Buscar produto</label>
            <input
              value={buscaProd}
              onChange={(e) => { setBuscaProd(e.target.value); setProdutoSelecionado(null) }}
              className="field w-full"
              placeholder="Digite o nome do produto..."
            />
            {produtosFiltrados.length > 0 && !produtoSelecionado && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {produtosFiltrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); selecionarProduto(p) }}
                    className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left text-sm">
                    <span className="font-medium text-gray-800">{p.nome}</span>
                    <span className="text-gray-400 text-xs ml-2">{fmt(p.preco ?? 0)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="w-32">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">A partir de (qtd)</label>
            <input
              value={novaQtdMin}
              onChange={(e) => setNovaQtdMin(e.target.value)}
              type="number"
              step="1"
              min="1"
              className="field w-full"
              placeholder="1"
            />
          </div>
          <div className="w-44">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço nesta tabela</label>
            <input
              value={novoPreco}
              onChange={(e) => setNovoPreco(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              className="field w-full"
              placeholder="0,00"
            />
          </div>
          <button
            onClick={handleAdicionar}
            disabled={!produtoSelecionado || !novoPreco || adicionando}
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
            {adicionando ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
        {erroAdicionar && <p className="text-sm text-red-600">{erroAdicionar}</p>}
      </div>

      {/* Itens */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-gray-600">{itens.length} produto{itens.length !== 1 ? 's' : ''} na tabela</p>
          <input
            value={buscaItens}
            onChange={(e) => setBuscaItens(e.target.value)}
            placeholder="Filtrar produtos da tabela..."
            className="field py-1.5 text-sm w-64"
          />
        </div>
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">A partir de</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Padrão</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Tabela</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Diferença</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {itensFiltrados.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum produto encontrado.</td></tr>
            ) : itensFiltrados.map((item) => {
              const prod = item.produtos
              const precoPadrao = prod?.preco ?? 0
              const diff = item.preco - precoPadrao
              const editando = editandoId === item.id
              return (
                <tr key={item.id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{prod?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{item.quantidade_minima}un+</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-400">{fmt(precoPadrao)}</td>
                  <td className="px-4 py-3 text-right">
                    {editando ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          autoFocus
                          value={editValor}
                          onChange={(e) => setEditValor(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSalvarEdicao(item.id)
                            if (e.key === 'Escape') setEditandoId(null)
                          }}
                          type="number"
                          step="0.01"
                          className="field w-28 text-right py-1 text-sm"
                        />
                        <button onClick={() => handleSalvarEdicao(item.id)}
                          className="text-xs text-green-600 font-semibold hover:text-green-800">✓</button>
                        <button onClick={() => setEditandoId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditandoId(item.id); setEditValor(item.preco.toString()) }}
                        className="text-sm font-semibold text-gray-800 hover:text-blue-600 group-hover:underline decoration-dashed underline-offset-2 transition">
                        {fmt(item.preco)}
                      </button>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${diff < 0 ? 'text-red-500' : diff > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${fmt(diff)}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemover(item.id)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium opacity-0 group-hover:opacity-100 transition">
                      Remover
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal importar em lote */}
      {mostrarImportar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Importar Todos os Produtos</h3>
                <p className="text-xs text-gray-400 mt-0.5">Adiciona produtos não inclusos aplicando % do preço padrão</p>
              </div>
              <button onClick={() => { setMostrarImportar(false); setImportMsg('') }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Multiplicador do preço padrão
                </label>
                <input
                  value={multiplicador}
                  onChange={(e) => setMultiplicador(e.target.value)}
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="field w-full"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Ex: <strong>0.9</strong> = 10% de desconto · <strong>1.0</strong> = mesmo preço · <strong>1.2</strong> = 20% a mais
                </p>
                {multiplicador && !isNaN(parseFloat(multiplicador)) && (
                  <p className="mt-1 text-xs text-blue-600 font-medium">
                    Preço padrão R$ 100,00 → nesta tabela {fmt(100 * parseFloat(multiplicador))}
                  </p>
                )}
              </div>
              {importMsg && (
                <p className={`text-sm font-medium ${importMsg.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>
                  {importMsg}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setMostrarImportar(false); setImportMsg('') }}
                  className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                  Cancelar
                </button>
                <button onClick={handleImportar} disabled={importando}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
                  {importando ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
