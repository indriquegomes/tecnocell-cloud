import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ deposito?: string; busca?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: depositos } = await supabase.from('depositos').select('id, nome').order('nome')

  let query = supabase
    .from('estoque')
    .select(`
      id, quantidade, updated_at,
      produto:produtos ( id, nome, marca, categoria, preco ),
      deposito:depositos ( id, nome )
    `)
    .order('quantidade', { ascending: true })
    .limit(300)

  if (params.deposito) query = query.eq('deposito_id', params.deposito)

  const { data: estoqueRaw } = await query

  const estoque = (estoqueRaw ?? []).filter((e: Record<string, unknown>) => {
    if (!params.busca) return true
    const nome = ((e.produto as { nome: string } | null)?.nome ?? '').toLowerCase()
    return nome.includes(params.busca.toLowerCase())
  })

  const semEstoque = estoque.filter((e: Record<string, unknown>) => (e.quantidade as number) <= 0).length
  const estoqueBaixo = estoque.filter((e: Record<string, unknown>) => (e.quantidade as number) > 0 && (e.quantidade as number) <= 3).length
  const emEstoque = estoque.filter((e: Record<string, unknown>) => (e.quantidade as number) > 3).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Estoque</h2>
        <Link href="/painel/estoque/movimentar"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Entrada / Saída
        </Link>
      </div>

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Em Estoque</p>
          <p className="text-3xl font-bold text-green-600">{emEstoque}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Estoque Baixo (≤3)</p>
          <p className="text-3xl font-bold text-yellow-600">{estoqueBaixo}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Sem Estoque</p>
          <p className="text-3xl font-bold text-red-600">{semEstoque}</p>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="busca"
          defaultValue={params.busca}
          placeholder="Buscar produto..."
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="deposito"
          defaultValue={params.deposito ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os depósitos</option>
          {(depositos ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.nome}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Filtrar
        </button>
      </form>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Marca</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Depósito</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantidade</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {estoque.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum registro de estoque.{' '}
                  <Link href="/painel/estoque/movimentar" className="text-blue-500 hover:underline">Registrar entrada</Link>.
                </td>
              </tr>
            ) : (
              estoque.map((e: Record<string, unknown>) => {
                const qtd = e.quantidade as number
                const prodId = (e.produto as { id: string } | null)?.id
                return (
                  <tr key={e.id as string} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      {(e.produto as { nome: string } | null)?.nome ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(e.produto as { marca: string } | null)?.marca ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {(e.deposito as { nome: string } | null)?.nome ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{qtd}</td>
                    <td className="px-4 py-3 text-center">
                      {qtd <= 0 ? (
                        <Badge variant="danger">Esgotado</Badge>
                      ) : qtd <= 3 ? (
                        <Badge variant="warning">Baixo</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {prodId && (
                        <Link
                          href={`/painel/estoque/movimentar?produto_id=${prodId}`}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition"
                        >
                          Ajustar
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
