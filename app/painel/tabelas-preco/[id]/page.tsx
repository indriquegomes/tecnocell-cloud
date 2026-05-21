import { createClient } from '@/lib/supabase/server'
import { adicionarItemTabela, removerItemTabela } from '../actions'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function TabelaPrecoDetalhe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string }>
}) {
  const { id } = await params
  const { erro } = await searchParams
  const supabase = await createClient()

  const [{ data: tabela }, { data: itens }, { data: produtos }] = await Promise.all([
    supabase.from('tabelas_preco').select('*').eq('id', id).single(),
    supabase
      .from('itens_tabela_preco')
      .select('*, produtos(id, nome, preco)')
      .eq('tabela_id', id)
      .order('created_at'),
    supabase.from('produtos').select('id, nome, preco').order('nome'),
  ])

  if (!tabela) notFound()

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const produtosNaTabela = new Set((itens ?? []).map((i) => i.produto_id))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/tabelas-preco" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{tabela.nome}</h2>
          {tabela.descricao && <p className="text-sm text-gray-400">{tabela.descricao}</p>}
        </div>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {/* Adicionar produto */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800">Adicionar Produto</h3>
        <form action={adicionarItemTabela.bind(null, id)} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Produto</label>
            <select name="produto_id" required className="field">
              <option value="">Selecione...</option>
              {(produtos ?? [])
                .filter((p) => !produtosNaTabela.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.nome} (padrão: {fmt(p.preco ?? 0)})</option>
                ))}
            </select>
          </div>
          <div className="w-40">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Preço Nesta Tabela</label>
            <input name="preco" type="number" step="0.01" min="0" required className="field" placeholder="0,00" />
          </div>
          <button type="submit"
            className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Adicionar
          </button>
        </form>
      </div>

      {/* Itens da tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Padrão</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Nesta Tabela</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Diferença</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(itens ?? []).length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum produto nesta tabela.</td></tr>
            ) : (itens ?? []).map((item) => {
              const produto = item.produtos as { nome: string; preco: number } | null
              const precoPadrao = produto?.preco ?? 0
              const diff = item.preco - precoPadrao
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{produto?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">{fmt(precoPadrao)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800">{fmt(item.preco)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${diff < 0 ? 'text-red-500' : diff > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${fmt(diff)}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={removerItemTabela.bind(null, item.id, id)}>
                      <button type="submit"
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                        onClick={(e) => { if (!confirm('Remover produto desta tabela?')) e.preventDefault() }}>
                        Remover
                      </button>
                    </form>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
