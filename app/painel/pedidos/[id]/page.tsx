import { createClient } from '@/lib/supabase/server'
import { adicionarItemPedido, removerItemPedido, atualizarStatusPedido } from '../actions'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function PedidoDetalhe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  const supabase = await createClient()

  const [{ data: pedido }, { data: itens }, { data: produtos }, { data: pessoas }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, pessoas(nome)')
      .eq('id', id)
      .single(),
    supabase
      .from('itens_pedido')
      .select('*, produtos(id, nome, preco)')
      .eq('pedido_id', id)
      .order('created_at'),
    supabase.from('produtos').select('id, nome, preco').eq('ativo', true).order('nome'),
    supabase.from('pessoas').select('id, nome').order('nome'),
  ])

  if (!pedido) notFound()

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR')

  const statusColors: Record<string, string> = {
    rascunho: 'bg-gray-100 text-gray-500',
    aprovado: 'bg-blue-100 text-blue-700',
    faturado: 'bg-green-100 text-green-700',
    cancelado: 'bg-red-100 text-red-500',
  }

  const proximoStatus: Record<string, { label: string; valor: string }> = {
    rascunho: { label: 'Aprovar', valor: 'aprovado' },
    aprovado: { label: 'Faturar', valor: 'faturado' },
  }

  const cliente = pedido.pessoas as { nome: string } | null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/pedidos" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">
              {pedido.tipo === 'orcamento' ? 'Orçamento' : 'Pedido'} #{id.slice(0, 8).toUpperCase()}
            </h2>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[pedido.status] ?? 'bg-gray-100 text-gray-500'}`}>
              {pedido.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            {cliente?.nome ?? 'Sem cliente'} · {fmtDate(pedido.created_at)}
          </p>
        </div>
        {pedido.status !== 'cancelado' && pedido.status !== 'faturado' && proximoStatus[pedido.status] && (
          <form action={atualizarStatusPedido.bind(null, id, proximoStatus[pedido.status].valor)}>
            <button type="submit"
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
              {proximoStatus[pedido.status].label}
            </button>
          </form>
        )}
        {pedido.status !== 'cancelado' && pedido.status !== 'faturado' && (
          <form action={atualizarStatusPedido.bind(null, id, 'cancelado')}>
            <button type="submit"
              className="rounded-xl border border-red-200 px-5 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 transition"
              onClick={(e) => { if (!confirm('Cancelar pedido?')) e.preventDefault() }}>
              Cancelar
            </button>
          </form>
        )}
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {/* Adicionar item */}
      {pedido.status === 'rascunho' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Adicionar Produto</h3>
          <form action={adicionarItemPedido.bind(null, id)} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto</label>
              <select name="produto_id" required className="field">
                <option value="">Selecione...</option>
                {(produtos ?? []).map((p) => (
                  <option key={p.id} value={p.id} data-preco={p.preco}>
                    {p.nome} — {fmt(p.preco ?? 0)}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Qtd</label>
              <input name="quantidade" type="number" step="1" min="1" defaultValue="1" className="field" />
            </div>
            <div className="w-36">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço Unit.</label>
              <input name="preco_unitario" type="number" step="0.01" min="0" required className="field" placeholder="0,00" />
            </div>
            <button type="submit"
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
              Adicionar
            </button>
          </form>
        </div>
      )}

      {/* Itens */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qtd</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Unit.</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
              {pedido.status === 'rascunho' && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(itens ?? []).length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum item adicionado.</td></tr>
            ) : (itens ?? []).map((item) => {
              const produto = item.produtos as { nome: string; preco: number } | null
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{produto?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{item.quantidade}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{fmt(item.preco_unitario ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(item.total_item ?? 0)}</td>
                  {pedido.status === 'rascunho' && (
                    <td className="px-4 py-3 text-right">
                      <form action={removerItemPedido.bind(null, item.id, id)}>
                        <button type="submit" className="text-xs text-red-500 hover:text-red-700 font-medium">
                          Remover
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          {(itens ?? []).length > 0 && (
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">Total</td>
                <td className="px-4 py-3 text-base font-bold text-gray-900 text-right">{fmt(pedido.total ?? 0)}</td>
                {pedido.status === 'rascunho' && <td />}
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
