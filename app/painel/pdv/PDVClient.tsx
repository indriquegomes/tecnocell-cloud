'use client'

import { useState, useCallback } from 'react'
import { formatBRL } from '@/lib/utils'
import { finalizarVenda } from './actions'

interface Produto {
  id: string
  nome: string
  preco: number
  codigo: string | null
  marca: string | null
  estoque_total: number
}

interface FormaPagamento {
  id: string
  nome: string
}

interface Pessoa {
  id: string
  nome: string
}

interface ItemCarrinho {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  estoque_disponivel: number
}

interface Props {
  produtos: Produto[]
  formas: FormaPagamento[]
  pessoas: Pessoa[]
}

export function PDVClient({ produtos, formas, pessoas }: Props) {
  const [busca, setBusca] = useState('')
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [formaPagamento, setFormaPagamento] = useState('')
  const [pessoaId, setPessoaId] = useState('')
  const [desconto, setDesconto] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [vendaConcluidaId, setVendaConcluidaId] = useState<string | null>(null)
  const [vendaTotal, setVendaTotal] = useState(0)

  const produtosFiltrados = busca.length >= 1
    ? produtos.filter((p) =>
        p.nome.toLowerCase().includes(busca.toLowerCase()) ||
        (p.codigo ?? '').toLowerCase().includes(busca.toLowerCase())
      ).slice(0, 8)
    : []

  const adicionarAoCarrinho = useCallback((p: Produto) => {
    if (p.estoque_total <= 0) {
      setErro(`"${p.nome}" está sem estoque.`)
      return
    }
    setErro(null)
    setCarrinho((prev) => {
      const existing = prev.find((i) => i.produto_id === p.id)
      if (existing) {
        if (existing.quantidade >= p.estoque_total) {
          setErro(`Estoque máximo disponível: ${p.estoque_total} unidade(s).`)
          return prev
        }
        return prev.map((i) => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      }
      return [...prev, {
        produto_id: p.id,
        nome: p.nome,
        quantidade: 1,
        preco_unitario: p.preco,
        estoque_disponivel: p.estoque_total,
      }]
    })
    setBusca('')
  }, [])

  const alterarQtd = (produto_id: string, delta: number) => {
    setErro(null)
    setCarrinho((prev) =>
      prev.map((i) => {
        if (i.produto_id !== produto_id) return i
        const novaQtd = i.quantidade + delta
        if (novaQtd > i.estoque_disponivel) {
          setErro(`Estoque máximo disponível: ${i.estoque_disponivel} unidade(s).`)
          return i
        }
        return { ...i, quantidade: Math.max(1, novaQtd) }
      })
    )
  }

  const remover = (produto_id: string) => {
    setErro(null)
    setCarrinho((prev) => prev.filter((i) => i.produto_id !== produto_id))
  }

  const subtotal = carrinho.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const descontoNum = Math.min(parseFloat(desconto) || 0, subtotal)
  const total = subtotal - descontoNum

  const handleFinalizar = async () => {
    if (carrinho.length === 0) { setErro('Adicione produtos ao carrinho.'); return }
    if (!formaPagamento) { setErro('Selecione a forma de pagamento.'); return }
    setErro(null)
    setLoading(true)
    try {
      const result = await finalizarVenda(
        carrinho.map(({ produto_id, nome, quantidade, preco_unitario }) => ({ produto_id, nome, quantidade, preco_unitario })),
        formaPagamento || null,
        pessoaId || null,
        descontoNum,
        observacoes,
      )
      setVendaConcluidaId(result.vendaId)
      setVendaTotal(result.total)
      setCarrinho([])
      setFormaPagamento('')
      setPessoaId('')
      setDesconto('')
      setObservacoes('')
    } catch (e) {
      setErro('Erro ao finalizar venda: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  if (vendaConcluidaId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-green-100 p-6 text-5xl mb-4">✓</div>
        <h3 className="text-2xl font-bold text-gray-900 mb-1">Venda Concluída!</h3>
        <p className="text-gray-500 mb-2">Total cobrado: <strong className="text-green-600">{formatBRL(vendaTotal)}</strong></p>
        <p className="text-xs text-gray-400 mb-6">ID: {vendaConcluidaId.slice(0, 8).toUpperCase()}</p>
        <button
          onClick={() => setVendaConcluidaId(null)}
          className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700 transition"
        >
          Nova Venda
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Coluna esquerda — busca + carrinho */}
      <div className="space-y-4">
        <div className="relative">
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setErro(null) }}
            placeholder="Buscar produto por nome ou código..."
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          {produtosFiltrados.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
              {produtosFiltrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => adicionarAoCarrinho(p)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-blue-50 transition text-left"
                >
                  <div>
                    <p className="font-medium text-gray-800">{p.nome}</p>
                    <p className="text-xs text-gray-400">
                      {p.marca && <span>{p.marca} · </span>}
                      {p.estoque_total > 0
                        ? <span className="text-green-600">{p.estoque_total} em estoque</span>
                        : <span className="text-red-500">Sem estoque</span>}
                    </p>
                  </div>
                  <span className={`font-semibold ml-4 shrink-0 ${p.estoque_total <= 0 ? 'text-gray-300' : 'text-green-600'}`}>
                    {formatBRL(p.preco)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {erro && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          {carrinho.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-gray-400">
              Nenhum item no carrinho.<br />Busque um produto acima.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Qtd</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unit.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {carrinho.map((item) => (
                  <tr key={item.produto_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{item.nome}</p>
                      <p className="text-xs text-gray-400">Disponível: {item.estoque_disponivel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button type="button" onClick={() => alterarQtd(item.produto_id, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold">−</button>
                        <span className="w-8 text-center text-sm font-semibold">{item.quantidade}</span>
                        <button type="button" onClick={() => alterarQtd(item.produto_id, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold">+</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">{formatBRL(item.preco_unitario)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {formatBRL(item.quantidade * item.preco_unitario)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button type="button" onClick={() => remover(item.produto_id)}
                        className="text-red-400 hover:text-red-600 transition text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Coluna direita — totais + pagamento */}
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Resumo da Venda</h3>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatBRL(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-600">
              <span>Desconto (R$)</span>
              <input
                type="number"
                min="0"
                max={subtotal}
                step="0.01"
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00"
                className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {descontoNum > 0 && descontoNum >= subtotal * 0.5 && (
              <p className="text-xs text-yellow-600">Desconto acima de 50% — confirme antes de finalizar.</p>
            )}
            <div className="flex justify-between border-t border-gray-100 pt-2 text-lg font-bold text-gray-900">
              <span>Total</span>
              <span className="text-green-600">{formatBRL(total)}</span>
            </div>
          </div>

          <div className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Forma de Pagamento <span className="text-red-500">*</span>
              </label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Selecionar —</option>
                {formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Cliente (opcional)</label>
              <select
                value={pessoaId}
                onChange={(e) => setPessoaId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Consumidor final —</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Observações</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Opcional..."
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinalizar}
            disabled={carrinho.length === 0 || loading}
            className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition"
          >
            {loading ? 'Processando...' : `Finalizar Venda — ${formatBRL(total)}`}
          </button>

          {carrinho.length > 0 && (
            <button
              type="button"
              onClick={() => { setCarrinho([]); setErro(null) }}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition"
            >
              Limpar Carrinho
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
