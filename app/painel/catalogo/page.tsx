import { createServiceClient } from '@/lib/supabase/server'
import { Paginacao } from '@/components/Paginacao'
import { toggleCatalogo, salvarDescricaoCatalogo } from './actions'
import Link from 'next/link'

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string; ok?: string; editar?: string
    busca?: string; categoria?: string; marca?: string; vis?: string; pagina?: string
  }>
}) {
  const { erro, ok, editar, busca, categoria, marca, vis, pagina: paginaRaw } = await searchParams
  const supabase = await createServiceClient()

  const porPagina = 48
  const pagina = Math.max(1, parseInt(paginaRaw ?? '1', 10) || 1)

  // paginado — o catálogo tem ~8k produtos; não dá pra jogar tudo no HTML de uma vez
  let query = supabase
    .from('produtos')
    .select('id, nome, descricao, preco, categoria, marca, ativo, visivel_catalogo, imagem_url, codigo', { count: 'exact' })
    .eq('ativo', true)
    .order('nome')

  if (busca) {
    const termo = busca.replace(/[,()]/g, ' ').trim()
    query = query.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`)
  }
  if (categoria) query = query.eq('categoria', categoria)
  if (marca) query = query.eq('marca', marca)
  if (vis === 'visiveis') query = query.eq('visivel_catalogo', true)
  if (vis === 'ocultos') query = query.eq('visivel_catalogo', false)

  const [{ data: produtos, count }, { data: categorias }, { data: marcas }, { count: visiveis }, editRes] = await Promise.all([
    query.range((pagina - 1) * porPagina, pagina * porPagina - 1),
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
    supabase.from('marcas').select('nome').order('nome'),
    supabase.from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true).eq('visivel_catalogo', true),
    editar
      ? supabase.from('produtos').select('id, nome, descricao, imagem_url').eq('id', editar).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const editarProduto = (editRes as { data: { id: string; nome: string; descricao: string | null; imagem_url: string | null } | null }).data

  const baseParams: Record<string, string> = {}
  if (busca) baseParams.busca = busca
  if (categoria) baseParams.categoria = categoria
  if (marca) baseParams.marca = marca
  if (vis) baseParams.vis = vis

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Catálogo de Produtos</h2>
          <p className="text-sm text-gray-400 mt-0.5">{visiveis ?? 0} produto{visiveis !== 1 ? 's' : ''} visíveis no catálogo online</p>
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

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="busca"
          defaultValue={busca}
          placeholder="Buscar por nome ou código..."
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select name="categoria" defaultValue={categoria ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas as categorias</option>
          {(categorias ?? []).map((c) => (
            <option key={c.hierarquia} value={c.hierarquia}>{c.nome}</option>
          ))}
        </select>
        <select name="marca" defaultValue={marca ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas as marcas</option>
          {(marcas ?? []).map((m) => (
            <option key={m.nome} value={m.nome}>{m.nome}</option>
          ))}
        </select>
        <select name="vis" defaultValue={vis ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos</option>
          <option value="visiveis">Só visíveis</option>
          <option value="ocultos">Só ocultos</option>
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Filtrar
        </button>
        <Link href="/painel/catalogo" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
          Limpar
        </Link>
        <span className="ml-auto self-center text-sm text-gray-400">{total} produtos</span>
      </form>

      {/* Grid de produtos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(produtos ?? []).length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
            Nenhum produto encontrado.
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

      <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} params={baseParams} basePath="/painel/catalogo" />
    </div>
  )
}
