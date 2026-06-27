import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { deletarProduto } from './actions'
import { BotaoExcluir } from '@/components/ui/botao-excluir'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string; categoria?: string; marca?: string
    ordem?: string; dir?: string
    preco_min?: string; preco_max?: string; prateleira?: string
    com_estoque?: string; so_inativos?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const ordemAtual = params.ordem ?? 'nome'
  const ordemDir   = params.dir === 'desc'
  const advancedOn = !!(params.preco_min || params.preco_max || params.prateleira || params.com_estoque || params.so_inativos)

  const ordemCampo = ordemAtual === 'marca'     ? 'marca'
    : ordemAtual === 'categoria' ? 'categoria'
    : ordemAtual === 'preco'     ? 'preco'
    : ordemAtual === 'custo'     ? 'preco_custo'
    : ordemAtual === 'status'    ? 'ativo'
    : 'nome'

  const ordemEstoque = ordemAtual === 'estoque'

  let query = supabase
    .from('produtos')
    .select(`
      id, nome, descricao, preco, preco_custo, marca, categoria, ativo, codigo, imagem_url,
      estoque_minimo,
      cat:categorias!categoria ( nome ),
      estoque ( quantidade )
    `)
    .order(ordemCampo, { ascending: !ordemDir })
    .limit(200)

  if (ordemAtual !== 'nome' && !ordemEstoque) query = query.order('nome')

  if (params.busca) {
    const termo = params.busca.replace(/[,()]/g, ' ').trim()
    query = query.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%,ean.ilike.%${termo}%,modelo.ilike.%${termo}%`)
  }
  if (params.categoria)  query = query.eq('categoria', params.categoria)
  if (params.marca)      query = query.eq('marca', params.marca)
  if (params.prateleira) query = query.ilike('prateleira', `%${params.prateleira}%`)
  if (params.preco_min)  query = query.gte('preco', parseFloat(params.preco_min))
  if (params.preco_max)  query = query.lte('preco', parseFloat(params.preco_max))
  if (params.so_inativos) query = query.eq('ativo', false)

  const [{ data: produtosRaw }, { data: categorias }, { data: marcas }] = await Promise.all([
    query,
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
    supabase.from('marcas').select('nome').order('nome'),
  ])

  const getEstoque = (p: Record<string, unknown>) =>
    ((p.estoque as { quantidade: number }[]) ?? []).reduce((s, e) => s + (e.quantidade ?? 0), 0)

  let produtos = ordemEstoque
    ? [...(produtosRaw ?? [])].sort((a, b) => {
        const diff = getEstoque(a as Record<string, unknown>) - getEstoque(b as Record<string, unknown>)
        return ordemDir ? -diff : diff
      })
    : (produtosRaw ?? [])

  if (params.com_estoque) {
    produtos = produtos.filter((p) => getEstoque(p as Record<string, unknown>) > 0)
  }

  // Params base pra preservar filtros nos links de ordenação
  const baseParams = {
    ...(params.busca      ? { busca: params.busca }           : {}),
    ...(params.categoria  ? { categoria: params.categoria }   : {}),
    ...(params.marca      ? { marca: params.marca }           : {}),
    ...(params.prateleira ? { prateleira: params.prateleira } : {}),
    ...(params.preco_min  ? { preco_min: params.preco_min }   : {}),
    ...(params.preco_max  ? { preco_max: params.preco_max }   : {}),
    ...(params.com_estoque  ? { com_estoque: params.com_estoque }   : {}),
    ...(params.so_inativos  ? { so_inativos: params.so_inativos }   : {}),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Produtos</h2>
          <Dica texto="Catálogo completo de produtos para venda. Configure preço, custo, categoria, marca e controle de estoque mínimo." />
        </div>
        <Link href="/painel/produtos/novo"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          + Novo Produto
        </Link>
      </div>

      {/* Filtros */}
      <form method="GET" className="space-y-3">
        {params.ordem && <input type="hidden" name="ordem" value={params.ordem} />}
        {params.dir   && <input type="hidden" name="dir"   value={params.dir}   />}

        {/* Filtros básicos */}
        <div className="flex flex-wrap gap-3">
          <input
            name="busca"
            defaultValue={params.busca}
            placeholder="Buscar por nome, código, EAN ou modelo..."
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select name="categoria" defaultValue={params.categoria ?? ''}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todas as categorias</option>
            {(categorias ?? []).map((c) => (
              <option key={c.hierarquia} value={c.hierarquia}>{c.nome}</option>
            ))}
          </select>
          <select name="marca" defaultValue={params.marca ?? ''}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
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
          <span className="ml-auto self-center text-sm text-gray-400">{produtos.length} registros</span>
        </div>

        {/* Busca Avançada */}
        <details open={advancedOn} className="rounded-xl border border-gray-200 bg-gray-50">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 list-none flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Busca Avançada
            {advancedOn && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">ativo</span>}
          </summary>
          <div className="border-t border-gray-200 px-4 py-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Prateleira</label>
                <input name="prateleira" defaultValue={params.prateleira}
                  placeholder="Ex: Vitrine 1"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Preço de R$</label>
                <input name="preco_min" type="number" min="0" step="any" defaultValue={params.preco_min}
                  placeholder="0"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-28" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">até R$</label>
                <input name="preco_max" type="number" min="0" step="any" defaultValue={params.preco_max}
                  placeholder="9999"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-28" />
              </div>
              <div className="flex items-center gap-5 pb-0.5">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" name="com_estoque" value="1" defaultChecked={!!params.com_estoque}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  Somente com estoque
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" name="so_inativos" value="1" defaultChecked={!!params.so_inativos}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  Somente inativos
                </label>
              </div>
            </div>
          </div>
        </details>
      </form>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { label: 'Produto',   ordem: 'nome',      align: 'text-left' },
                { label: 'Marca',     ordem: 'marca',     align: 'text-left' },
                { label: 'Categoria', ordem: 'categoria', align: 'text-left' },
                { label: 'Preço',     ordem: 'preco',     align: 'text-right' },
                { label: 'Custo',     ordem: 'custo',     align: 'text-right' },
                { label: 'Estoque',   ordem: 'estoque',   align: 'text-center' },
                { label: 'Status',    ordem: 'status',    align: 'text-center' },
              ].map(({ label, ordem, align }) => {
                const ativo    = ordemAtual === ordem
                const nextDir  = ativo ? (ordemDir ? 'asc' : 'desc') : 'asc'
                const qs = new URLSearchParams({
                  ...baseParams,
                  ordem,
                  ...(nextDir === 'desc' ? { dir: 'desc' } : {}),
                }).toString()
                const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↑'
                return (
                  <th key={ordem} className={`px-4 py-3 ${align} text-xs font-semibold uppercase tracking-wide`}>
                    <Link href={`?${qs}`} className={`inline-flex items-center gap-1 hover:text-blue-600 transition-colors ${ativo ? 'text-blue-600' : 'text-gray-500'}`}>
                      {label}
                      <span className={ativo ? 'text-blue-500' : 'text-gray-300'}>{arrow}</span>
                    </Link>
                  </th>
                )
              })}
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {produtos.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum produto encontrado. <Link href="/painel/produtos/novo" className="text-blue-500 hover:underline">Cadastrar produto</Link>.
                </td>
              </tr>
            ) : (
              produtos.map((p: Record<string, unknown>) => {
                const estoqueTotal = getEstoque(p)
                const minimo       = (p.estoque_minimo as number) ?? 0
                const abaixoMinimo = minimo > 0 && estoqueTotal < minimo
                return (
                  <tr key={p.id as string} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.imagem_url ? (
                          <img src={p.imagem_url as string} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg className="h-5 w-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-800">{p.nome as string}</p>
                          {p.codigo != null && <p className="text-xs text-gray-400">#{String(p.codigo)}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{(p.marca as string) || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {(p.cat as { nome: string } | null)?.nome || '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {formatBRL(p.preco as number)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">
                      {(p.preco_custo as number) > 0 ? formatBRL(p.preco_custo as number) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-center text-sm font-medium ${abaixoMinimo ? 'text-red-600' : 'text-gray-700'}`}>
                      {estoqueTotal}
                      {abaixoMinimo && <span className="ml-1 text-xs text-red-400">(mín {minimo})</span>}
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
