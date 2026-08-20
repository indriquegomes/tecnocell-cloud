import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { BuscaLista } from '@/components/BuscaLista'
import { ImportarAnunciosBotao } from '@/app/painel/integracoes/lojas/ImportarAnunciosBotao'

type AnuncioLinha = {
  ml_item_id: string
  titulo_ml: string
  preco_ml: number | null
  produto_id: string | null
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
    .select('ml_item_id, titulo_ml, preco_ml, produto_id')
    .eq('conexao_id', conexaoId)
    .order('titulo_ml')

  const termo = busca?.trim()
  if (termo) q = q.ilike('titulo_ml', `%${termo}%`)

  const anuncios = await fetchAll<AnuncioLinha>((de, ate) => q.range(de, ate))

  const produtoIds = anuncios.map((a) => a.produto_id).filter((id): id is string => !!id)
  const produtos = await fetchAllIn<{ id: string; codigo: string | null }>(produtoIds, (chunk, de, ate) =>
    supabase.from('produtos').select('id, codigo').in('id', chunk).range(de, ate))
  const codigoPorProduto = new Map(produtos.map((p) => [p.id, p.codigo]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <BuscaLista basePath={`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios`} placeholder="Buscar anúncio..." />
        <ImportarAnunciosBotao conexaoId={conexaoId} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Anúncio</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço ML</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ver no ML</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {anuncios.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum anúncio importado ainda.</td></tr>
            ) : anuncios.map((a) => (
              <tr key={a.ml_item_id} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{a.titulo_ml}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {a.produto_id
                    ? (codigoPorProduto.get(a.produto_id) ?? a.produto_id)
                    : <span className="text-amber-600">sem correspondência</span>}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{a.preco_ml != null ? formatBRL(a.preco_ml) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <a href={`https://produto.mercadolivre.com.br/${a.ml_item_id}`} target="_blank" rel="noreferrer"
                    className="text-xs font-medium text-blue-600 hover:underline">
                    Abrir
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
