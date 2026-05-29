import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { deletarProduto } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import Link from 'next/link'

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; categoria?: string; marca?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  let query = supabase
    .from('produtos')
    .select(`
      id, nome, descricao, preco, preco_custo, marca, categoria, ativo, codigo,
      cat:categorias!categoria ( nome ),
      estoque ( quantidade )
    `)
    .order('nome')
    .limit(200)

  if (params.busca) query = query.ilike('nome', `%${params.busca}%`)
  if (params.categoria) query = query.eq('categoria', params.categoria)
  if (params.marca) query = query.eq('marca', params.marca)

  const [{ data: produtos }, { data: categorias }, { data: marcas }] = await Promise.all([
    query,
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
    supabase.from('marcas').select('nome').order('nome'),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Produtos</h2>
        <Link href="/painel/produtos/novo"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Novo Produto
        </Link>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="busca"
          defaultValue={params.busca}
          placeholder="Buscar por nome..."
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="categoria"
          defaultValue={params.categoria ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas as categorias</option>
          {(categorias ?? []).map((c) => (
            <option key={c.hierarquia} value={c.hierarquia}>{c.nome}</option>
          ))}
        </select>
        <select
          name="marca"
          defaultValue={params.marca ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas as marcas</option>
          {(marcas ?? []).map((m) => (
            <option key={m.nome} value={m.nome}>{m.nome}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Filtrar
        </button>
        <Link href="/painel/produtos" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
          Limpar
        </Link>
        <span className="ml-auto self-center text-sm text-gray-400">{produtos?.length ?? 0} registros</span>
      </form>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Marca</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Preço</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Estoque</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(produtos ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum produto encontrado. <Link href="/painel/produtos/novo" className="text-blue-500 hover:underline">Cadastrar produto</Link>.
                </td>
              </tr>
            ) : (
              (produtos ?? []).map((p: Record<string, unknown>) => {
                const estoqueTotal = ((p.estoque as { quantidade: number }[]) ?? [])
                  .reduce((s, e) => s + (e.quantidade ?? 0), 0)
                return (
                  <tr key={p.id as string} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{p.nome as string}</p>
                      {p.codigo != null && <p className="text-xs text-gray-400">#{String(p.codigo)}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{(p.marca as string) || '�'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {(p.cat as { nome: string } | null)?.nome || '�'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {formatBRL(p.preco as number)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">
                      {(p.preco_custo as number) > 0 ? formatBRL(p.preco_custo as number) : '�'}
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-700">
                      {estoqueTotal}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={p.ativo ? 'success' : 'danger'}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/painel/produtos/${p.id as string}/editar`}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition"
                        >
                          Editar
                        </Link>
                        <BotaoExcluir action={deletarProduto.bind(null, p.id as string)} mensagem="Excluir este produto?" />
                      </div>
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

