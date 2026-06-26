'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adicionarItemPedido, removerItemPedido, atualizarStatusPedido } from '../actions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', aprovado: 'Aprovado', faturado: 'Faturado', cancelado: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  rascunho: 'bg-gray-100 text-gray-500',
  aprovado: 'bg-blue-100 text-blue-700',
  faturado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-600',
}

type Item = {
  id: string
  produto_id: string
  quantidade: number
  preco_unitario: number
  total_item: number
  produtos: { id: string; nome: string; preco: number } | null
}

type Produto = { id: string; nome: string; preco: number }

export function PedidoDetalheClient({
  pedido,
  itensIniciais,
  produtos,
}: {
  pedido: {
    id: string
    numero: number | null
    tipo: string
    status: string
    total: number
    data_validade: string | null
    observacoes: string | null
    created_at: string
    pessoas: { nome: string } | null
  }
  itensIniciais: Item[]
  produtos: Produto[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [itens, setItens] = useState(itensIniciais)

  // Adicionar produto
  const [busca, setBusca] = useState('')
  const [produtoSel, setProdutoSel] = useState<Produto | null>(null)
  const [quantidade, setQuantidade] = useState('1')
  const [precoUnit, setPrecoUnit] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [erroAdd, setErroAdd] = useState('')

  const idsNaLista = useMemo(() => new Set(itens.map((i) => i.produto_id)), [itens])

  const sugestoes = useMemo(() => {
    const q = busca.toLowerCase().trim()
    if (!q || produtoSel) return []
    return produtos.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 8)
  }, [busca, produtos, produtoSel])

  const selecionarProduto = (p: Produto) => {
    setProdutoSel(p)
    setBusca(p.nome)
    setPrecoUnit(p.preco?.toString() ?? '')
  }

  const handleAdicionar = async () => {
    if (!produtoSel || !precoUnit) return
    setAdicionando(true)
    setErroAdd('')
    const fd = new FormData()
    fd.set('produto_id', produtoSel.id)
    fd.set('quantidade', quantidade || '1')
    fd.set('preco_unitario', precoUnit)
    const res = await adicionarItemPedido(pedido.id, fd)
    if (res?.error) {
      setErroAdd(res.error)
    } else {
      setBusca('')
      setProdutoSel(null)
      setQuantidade('1')
      setPrecoUnit('')
      router.refresh()
    }
    setAdicionando(false)
  }

  const handleRemover = (itemId: string) => {
    setItens((prev) => prev.filter((i) => i.id !== itemId))
    startTransition(async () => {
      await removerItemPedido(itemId, pedido.id)
      router.refresh()
    })
  }

  const handleStatus = (novoStatus: string) => {
    startTransition(async () => {
      await atualizarStatusPedido(pedido.id, novoStatus)
      router.refresh()
    })
  }

  const podeEditar = pedido.status === 'rascunho'
  const totalAtual = itens.reduce((s, i) => s + (i.total_item ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">
              {pedido.tipo === 'orcamento' ? 'Orçamento' : 'Pedido'} #{pedido.numero ?? '—'}
            </h2>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[pedido.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {STATUS_LABEL[pedido.status] ?? pedido.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {pedido.pessoas?.nome ?? 'Sem cliente'} · {fmtDate(pedido.created_at)}
            {pedido.data_validade && ` · Válido até ${new Date(pedido.data_validade).toLocaleDateString('pt-BR')}`}
          </p>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {/* Aprovar */}
          {pedido.status === 'rascunho' && (
            <button onClick={() => handleStatus('aprovado')}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
              Aprovar
            </button>
          )}
          {/* Abrir no PDV */}
          {(pedido.status === 'rascunho' || pedido.status === 'aprovado') && itens.length > 0 && (
            <a href={`/painel/pdv?pedido=${pedido.id}`}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition">
              Abrir no PDV
            </a>
          )}
          {/* Cancelar */}
          {pedido.status !== 'cancelado' && pedido.status !== 'faturado' && (
            <button
              onClick={() => { if (confirm('Cancelar este pedido/orçamento?')) handleStatus('cancelado') }}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 transition">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Adicionar produto — só em rascunho */}
      {podeEditar && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Adicionar Produto</h3>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="relative flex-1 min-w-56">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto</label>
              <input
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setProdutoSel(null) }}
                className="field w-full"
                placeholder="Digite o nome do produto..."
              />
              {sugestoes.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {sugestoes.map((p) => (
                    <button key={p.id} type="button" onClick={() => selecionarProduto(p)}
                      className="flex w-full items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left text-sm">
                      <span className="font-medium text-gray-800">{p.nome}</span>
                      <span className="text-gray-400 text-xs ml-2">{fmt(p.preco ?? 0)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-24">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Qtd</label>
              <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
                type="number" step="1" min="1" className="field w-full" />
            </div>
            <div className="w-36">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço Unit.</label>
              <input value={precoUnit} onChange={(e) => setPrecoUnit(e.target.value)}
                type="number" step="0.01" min="0" className="field w-full" placeholder="0,00" />
            </div>
            <button onClick={handleAdicionar} disabled={!produtoSel || !precoUnit || adicionando}
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
              {adicionando ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
          {erroAdd && <p className="text-sm text-red-600">{erroAdd}</p>}
        </div>
      )}

      {/* Tabela de itens */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Unit.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              {podeEditar && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {itens.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                Nenhum item adicionado.
              </td></tr>
            ) : itens.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 group">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{item.produtos?.nome ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{item.quantidade}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(item.preco_unitario ?? 0)}</td>
                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(item.total_item ?? 0)}</td>
                {podeEditar && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleRemover(item.id)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium opacity-0 group-hover:opacity-100 transition">
                      Remover
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {itens.length > 0 && (
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={podeEditar ? 3 : 3} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">Total</td>
                <td className="px-4 py-3 text-base font-bold text-gray-900 text-right">{fmt(totalAtual)}</td>
                {podeEditar && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pedido.observacoes && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Observações</p>
          <p className="text-sm text-gray-700">{pedido.observacoes}</p>
        </div>
      )}
    </div>
  )
}
