import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { BuscaLista } from '@/components/BuscaLista'
import { DEPOSITO_PETROPOLIS_LOJA } from '@/lib/mercado-livre'

type AnuncioLinha = {
  ml_item_id: string
  titulo_ml: string
  preco_ml: number | null
  produto_id: string | null
  is_catalogo: boolean
  catalog_product_id: string | null
}

export default async function MeusAnunciosMLPage({
  params, searchParams,
}: {
  params: Promise<{ conexaoId: string }>
  searchParams: Promise<{ busca?: string }>
}) {
  const { conexaoId } = await params
  const { busca } = await searchParams
  const supabase = await createServiceClient()

  let q = supabase
    .from('integracoes_mercado_livre_anuncios')
    .select('ml_item_id, titulo_ml, preco_ml, produto_id, is_catalogo, catalog_product_id')
    .eq('conexao_id', conexaoId)
    .order('titulo_ml')

  const termo = busca?.trim()
  if (termo) q = q.ilike('titulo_ml', `%${termo}%`)

  const anuncios = await fetchAll<AnuncioLinha>((de, ate) => q.range(de, ate))

  const produtoIds = anuncios.map((a) => a.produto_id).filter((id): id is string => !!id)
  const produtos = await fetchAllIn<{ id: string; codigo: string | null; nome: string | null }>(produtoIds, (chunk, de, ate) =>
    supabase.from('produtos').select('id, codigo, nome').in('id', chunk).range(de, ate))
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]))

  // Mesmo depósito que sincronizarEstoqueML usa — pra bater com o que
  // realmente está valendo no anúncio, não a soma de todos os depósitos.
  const estoques = await fetchAllIn<{ produto_id: string; quantidade: number | null }>(produtoIds, (chunk, de, ate) =>
    supabase.from('estoque').select('produto_id, quantidade').in('produto_id', chunk).eq('deposito_id', DEPOSITO_PETROPOLIS_LOJA).range(de, ate))
  const estoquePorProduto = new Map(estoques.map((e) => [e.produto_id, e.quantidade ?? 0]))

  return (
    <div className="space-y-4">
      <BuscaLista basePath={`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios`} placeholder="Buscar anúncio..." />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nome</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vínculo com Catálogo</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto no TecnoCell</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estoque</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {anuncios.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum anúncio importado ainda.</td></tr>
            ) : anuncios.map((a) => {
              const produto = a.produto_id ? produtoPorId.get(a.produto_id) : null
              return (
                <tr key={a.ml_item_id} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm">
                    <a href={`https://produto.mercadolivre.com.br/${a.ml_item_id}`} target="_blank" rel="noreferrer"
                      className="font-medium text-blue-600 hover:underline">
                      {a.ml_item_id}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{a.titulo_ml}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{a.is_catalogo ? 'Catálogo' : 'Comum'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{a.is_catalogo ? (a.catalog_product_id ?? '—') : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {produto
                      ? <>{produto.nome} <span className="text-gray-400">({produto.codigo ?? a.produto_id})</span></>
                      : <span className="text-amber-600">sem correspondência</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{a.preco_ml != null ? formatBRL(a.preco_ml) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">
                    {a.produto_id ? (estoquePorProduto.get(a.produto_id) ?? 0) : '—'}
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
