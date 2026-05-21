import { createClient } from '@/lib/supabase/server'
import { toggleCatalogo, salvarDescricaoCatalogo } from './actions'

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; editar?: string }>
}) {
  const { erro, ok, editar } = await searchParams
  const supabase = await createClient()

  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, descricao, preco, categoria, marca, ativo, visivel_catalogo, imagem_url, codigo')
    .eq('ativo', true)
    .order('nome')

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const visiveis = (produtos ?? []).filter((p) => p.visivel_catalogo).length
  const editarProduto = editar ? (produtos ?? []).find((p) => p.id === editar) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Catálogo de Produtos</h2>
          <p className="text-sm text-gray-400 mt-0.5">{visiveis} produto{visiveis !== 1 ? 's' : ''} visíveis no catálogo online</p>
        </div>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}
      {ok && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Produto atualizado no catálogo!</div>}

      {/* Editar descrição/imagem */}
      {editarProduto && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Editar Vitrine: {editarProduto.nome}</h3>
          <form action={salvarDescricaoCatalogo} className="space-y-4">
            <input type="hidden" name="id" value={editarProduto.id} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Descrição para o catálogo</label>
              <textarea name="descricao" rows={3} defaultValue={editarProduto.descricao ?? ''}
                className="field resize-none" placeholder="Descreva o produto para o cliente..." />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">URL da Imagem</label>
              <input name="imagem_url" defaultValue={editarProduto.imagem_url ?? ''} className="field"
                placeholder="https://..." />
            </div>
            <div className="flex gap-3">
              <button type="submit"
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
                Salvar
              </button>
              <a href="/painel/catalogo"
                className="rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancelar
              </a>
            </div>
          </form>
        </div>
      )}

      {/* Grid de produtos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(produtos ?? []).length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
            Nenhum produto cadastrado.
          </div>
        ) : (produtos ?? []).map((p) => (
          <div key={p.id} className={`rounded-xl border p-4 space-y-3 ${p.visivel_catalogo ? 'border-blue-200 bg-white' : 'border-gray-200 bg-gray-50'}`}>
            {p.imagem_url ? (
              <img src={p.imagem_url} alt={p.nome} className="w-full h-32 object-cover rounded-lg" />
            ) : (
              <div className="w-full h-32 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300">
                <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-800 text-sm">{p.nome}</p>
              {p.categoria && <p className="text-xs text-gray-400">{p.categoria} {p.marca ? `· ${p.marca}` : ''}</p>}
              <p className="text-base font-bold text-blue-600 mt-1">{fmt(p.preco ?? 0)}</p>
              {p.descricao && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.descricao}</p>}
            </div>
            <div className="flex gap-2">
              <form action={toggleCatalogo.bind(null, p.id, p.visivel_catalogo ?? false)} className="flex-1">
                <button type="submit"
                  className={`w-full rounded-lg py-1.5 text-xs font-semibold transition ${p.visivel_catalogo ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-gray-200 text-gray-500 hover:bg-gray-100'}`}>
                  {p.visivel_catalogo ? 'Visível no Catálogo' : 'Oculto'}
                </button>
              </form>
              <a href={`/painel/catalogo?editar=${p.id}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition">
                Editar
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
