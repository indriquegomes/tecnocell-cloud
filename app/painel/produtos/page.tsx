import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { IconPlus, IconPackage } from '@/components/icons'
import { formatBRL } from '@/lib/utils'
import { Paginacao } from '@/components/Paginacao'
import { BuscaProdutos } from './BuscaProdutos'
import { ColunasDeposito } from './ColunasDeposito'
import { getCategoriasCache, getMarcasCache, getDepositosCache } from '@/lib/cache-catalogo'
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
    com_estoque?: string; so_inativos?: string; deposito?: string; pagina?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const ordemAtual = params.ordem ?? 'nome'
  const ordemDir   = params.dir === 'desc'
  const advancedOn = !!(params.preco_min || params.preco_max || params.prateleira || params.com_estoque || params.so_inativos || params.deposito)

  const ordemCampo = ordemAtual === 'marca'     ? 'marca'
    : ordemAtual === 'categoria' ? 'categoria'
    : ordemAtual === 'preco'     ? 'preco'
    : ordemAtual === 'custo'     ? 'preco_custo'
    : ordemAtual === 'status'    ? 'ativo'
    : 'nome'

  const ordemEstoque = ordemAtual === 'estoque'

  const porPagina = 50
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)
  // ordenar por estoque ou filtrar "só com estoque" precisa de todos os itens (agregado do join, feito em JS)
  const precisaTudo = ordemEstoque || !!params.com_estoque

  // Com o filtro de depósito, TODA a tela (número, ordenação, "somente com estoque")
  // passa a olhar só aquele depósito — pedido do Vitor: "mostra só o de Petrópolis"
  const getEstoque = (p: Record<string, unknown>) =>
    ((p.estoque as { quantidade: number; deposito_id: string }[]) ?? [])
      .filter((e) => !params.deposito || e.deposito_id === params.deposito)
      .reduce((s, e) => s + (e.quantidade ?? 0), 0)
  // total geral (todos os depósitos) — o alerta de estoque mínimo compara com o TODO,
  // senão filtrar um depósito dispararia "abaixo do mínimo" falso
  const getEstoqueGeral = (p: Record<string, unknown>) =>
    ((p.estoque as { quantidade: number }[]) ?? []).reduce((s, e) => s + (e.quantidade ?? 0), 0)

  const buildQ = (withCount: boolean) => {
    let q = supabase
      .from('produtos')
      .select(`
        id, nome, descricao, preco, preco_custo, marca, categoria, ativo, codigo, imagem_url,
        estoque_minimo,
        cat:categorias!categoria ( nome ),
        estoque ( quantidade, deposito_id )
      `, withCount ? { count: 'exact' as const } : undefined)
      .order(ordemCampo, { ascending: !ordemDir })
    if (ordemAtual !== 'nome' && !ordemEstoque) q = q.order('nome')
    if (params.busca) {
      // multi-palavra + sem acento: cada palavra tem que aparecer em busca_norm (nome+código+marca)
      const semAcento = params.busca.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
      const palavras = semAcento.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
      for (const w of palavras) q = q.ilike('busca_norm', `%${w}%`)
    }
    if (params.categoria)  q = q.eq('categoria', params.categoria)
    if (params.marca)      q = q.eq('marca', params.marca)
    if (params.prateleira) q = q.ilike('prateleira', `%${params.prateleira}%`)
    if (params.preco_min)  q = q.gte('preco', parseFloat(params.preco_min))
    if (params.preco_max)  q = q.lte('preco', parseFloat(params.preco_max))
    if (params.so_inativos) q = q.eq('ativo', false)
    return q
  }

  const [categorias, marcas, depositos] = await Promise.all([
    getCategoriasCache(),
    getMarcasCache(),
    getDepositosCache(),
  ])
  // depósitos reais (com loja) — mesmo critério do PDV pra mostrar saldo por depósito
  const depositosReais = (depositos ?? []).filter((d) => d.loja_id)
  const estoquePorDep = (p: Record<string, unknown>): Record<string, number> => {
    const m: Record<string, number> = {}
    for (const e of (p.estoque as { quantidade: number; deposito_id: string }[]) ?? []) m[e.deposito_id] = (m[e.deposito_id] ?? 0) + (e.quantidade ?? 0)
    return m
  }

  let produtos: Record<string, unknown>[]
  let total: number
  if (precisaTudo) {
    const todos = await fetchAll<Record<string, unknown>>(
      (from, to) => buildQ(false).range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null }>,
    )
    let arr = params.com_estoque ? todos.filter((p) => getEstoque(p) > 0) : todos
    if (ordemEstoque) arr = [...arr].sort((a, b) => { const d = getEstoque(a) - getEstoque(b); return ordemDir ? -d : d })
    total = arr.length
    produtos = arr.slice((pagina - 1) * porPagina, pagina * porPagina)
  } else {
    const { data, count } = await buildQ(true).range((pagina - 1) * porPagina, pagina * porPagina - 1)
    produtos = (data ?? []) as unknown as Record<string, unknown>[]
    total = count ?? 0
  }
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

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
    ...(params.deposito     ? { deposito: params.deposito }         : {}),
  }
  const depFiltrado = params.deposito ? depositosReais.find((d) => d.id === params.deposito) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Produtos</h2>
          <Dica texto="Catálogo completo de produtos para venda. Configure preço, custo, categoria, marca e controle de estoque mínimo." />
        </div>
        <Link href="/painel/produtos/novo"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <IconPlus className="h-4 w-4" /> Novo Produto
        </Link>
      </div>

      {/* Filtros */}
      <form method="GET" className="space-y-3">
        {params.ordem && <input type="hidden" name="ordem" value={params.ordem} />}
        {params.dir   && <input type="hidden" name="dir"   value={params.dir}   />}
        {params.busca && <input type="hidden" name="busca" value={params.busca} />}

        {/* Filtros básicos */}
        <div className="flex flex-wrap gap-3">
          <BuscaProdutos />
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
          <div className="ml-auto flex items-center gap-3">
            <ColunasDeposito depositos={depositosReais.map((d) => ({ id: d.id, nome: d.nome }))} />
            <span className="self-center text-sm text-gray-400">{produtos.length} registros</span>
          </div>
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
                <label className="mb-1 block text-xs font-medium text-gray-500">Depósito</label>
                <select name="deposito" defaultValue={params.deposito ?? ''}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todos os depósitos</option>
                  {depositosReais.map((d) => (
                    <option key={d.id} value={d.id}>{d.nome}</option>
                  ))}
                </select>
              </div>
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
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { label: 'Produto',   ordem: 'nome',      align: 'text-left' },
                { label: 'Marca',     ordem: 'marca',     align: 'text-left' },
                { label: 'Categoria', ordem: 'categoria', align: 'text-left' },
                { label: 'Preço',     ordem: 'preco',     align: 'text-right' },
                { label: 'Custo',     ordem: 'custo',     align: 'text-right' },
                { label: depFiltrado ? `Estoque · ${depFiltrado.nome}` : 'Estoque', ordem: 'estoque', align: 'text-center' },
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
              {/* Colunas de estoque por depósito — o botão "Colunas" liga/desliga cada uma (CSS) */}
              {depositosReais.map((d) => (
                <th key={d.id} data-col-dep={d.id} className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {d.nome}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {produtos.length === 0 ? (
              <tr>
                <td colSpan={8 + depositosReais.length} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum produto encontrado. <Link href="/painel/produtos/novo" className="text-blue-500 hover:underline">Cadastrar produto</Link>.
                </td>
              </tr>
            ) : (
              produtos.map((p: Record<string, unknown>) => {
                const estoqueTotal = getEstoque(p)   // com filtro de depósito = só aquele depósito
                const minimo       = (p.estoque_minimo as number) ?? 0
                const abaixoMinimo = minimo > 0 && getEstoqueGeral(p) < minimo
                return (
                  <tr key={p.id as string} className="hover:bg-blue-50/60 transition">
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
                    <td className="px-4 py-3 text-center">
                      {(() => { const ed = estoquePorDep(p); const neg = estoqueTotal < 0; return (
                        <details className="group inline-block text-left">
                          <summary className="mx-auto flex w-fit cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-gray-100">
                            <span className={`text-sm font-bold tabular-nums ${neg ? 'text-red-600' : abaixoMinimo ? 'text-amber-600' : 'text-gray-800'}`}>{estoqueTotal}</span>
                            {abaixoMinimo && !neg && <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-600">mín {minimo}</span>}
                            <svg className="h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          </summary>
                          <div className="mt-1.5 min-w-[168px] space-y-1 rounded-xl border border-gray-100 bg-gray-50/80 p-2.5 shadow-sm">
                            {depositosReais.map((d) => { const q = ed[d.id] ?? 0; const sel = d.id === params.deposito; return (
                              <div key={d.id} className={`flex items-center justify-between gap-3 text-[11px] ${sel ? 'rounded-md bg-blue-50 px-1.5 py-0.5 -mx-1' : ''}`}>
                                <span className={`flex items-center gap-1.5 ${sel ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>
                                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${q < 0 ? 'bg-red-500' : q > 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
                                  {d.nome}
                                </span>
                                <span className={`tabular-nums font-bold ${q < 0 ? 'text-red-600' : q > 0 ? 'text-green-700' : 'text-gray-300'}`}>{q}</span>
                              </div>
                            )})}
                          </div>
                        </details>
                      )})()}
                    </td>
                    {/* uma célula de estoque por depósito (escondida/mostrada pelo botão Colunas) */}
                    {depositosReais.map((d) => { const q = estoquePorDep(p)[d.id] ?? 0; return (
                      <td key={d.id} data-col-dep={d.id} className="px-3 py-3 text-center">
                        <span className={`text-sm font-semibold tabular-nums ${q < 0 ? 'text-red-600' : q > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{q}</span>
                      </td>
                    )})}
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
        <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} params={baseParams} basePath="/painel/produtos" />
      </div>
    </div>
  )
}
