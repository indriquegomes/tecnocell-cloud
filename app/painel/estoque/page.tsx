import { IconPackage } from '@/components/icons'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Paginacao } from '@/components/Paginacao'
import { BuscaEstoque } from './BuscaEstoque'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ deposito?: string; busca?: string; categoria?: string; dir?: string; pagina?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  // só Quantidade é ordenável (coluna direta, confiável com paginação). Produto/Marca/
  // Depósito viram cabeçalho fixo — a busca no servidor é a navegação (acha em tudo).
  const ordemDir = params.dir === 'desc'
  const baseParams: Record<string, string> = {}
  if (params.deposito)  baseParams.deposito  = params.deposito
  if (params.busca)     baseParams.busca     = params.busca
  if (params.categoria) baseParams.categoria = params.categoria
  const qtdSort = (() => {
    const nextDir = ordemDir ? 'asc' : 'desc'
    const arrow = ordemDir ? '↓' : '↑'
    const qs = new URLSearchParams({ ...baseParams, ...(nextDir === 'desc' ? { dir: 'desc' } : {}) }).toString()
    return { href: `/painel/estoque${qs ? '?' + qs : ''}`, arrow }
  })()

  const porPagina = 50
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10) || 1)

  const [{ data: depositos }, { data: categorias }] = await Promise.all([
    supabase.from('depositos').select('id, nome, loja_id').order('nome'),
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
  ])
  // só depósitos de loja viram botão (os "abstratos" tipo Estoque Geral ficam no menos-usado)
  const depsBotao = (depositos ?? []).filter((d) => d.loja_id)

  // busca sem acento em produtos.busca_norm (cada palavra, qualquer ordem)
  const semAcento = (s: string) => s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
  const palavras = params.busca ? semAcento(params.busca.trim()).replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6) : []

  let query = supabase.from('estoque')
    .select('id, quantidade, produto:produtos!inner ( id, nome, marca, categoria, preco, busca_norm ), deposito:depositos ( id, nome )', { count: 'exact' })
    .order('quantidade', { ascending: !ordemDir })
  if (params.deposito)  query = query.eq('deposito_id', params.deposito)
  if (params.categoria) query = query.eq('produto.categoria', params.categoria)
  for (const w of palavras) query = query.ilike('produto.busca_norm', `%${w}%`)
  const { data: estoque, count } = await query.range((pagina - 1) * porPagina, pagina * porPagina - 1)
  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

  // Cards de resumo: contam TODO o estoque do depósito filtrado (não só a página).
  const cardCount = async (faixa: (q: ReturnType<typeof baseCard>) => ReturnType<typeof baseCard>) => {
    const { count: c } = await faixa(baseCard())
    return c ?? 0
  }
  function baseCard() {
    // com filtro de categoria precisa do join (inner) pra contar só a categoria
    let q = params.categoria
      ? supabase.from('estoque').select('id, produto:produtos!inner ( categoria )', { count: 'exact', head: true }).eq('produto.categoria', params.categoria)
      : supabase.from('estoque').select('id', { count: 'exact', head: true })
    if (params.deposito) q = q.eq('deposito_id', params.deposito)
    return q
  }
  const [emEstoque, estoqueBaixo, semEstoque] = await Promise.all([
    cardCount((q) => q.gt('quantidade', 3)),
    cardCount((q) => q.gt('quantidade', 0).lte('quantidade', 3)),
    cardCount((q) => q.lte('quantidade', 0)),
  ])

  const linhas = (estoque ?? []) as unknown as {
    id: string; quantidade: number
    produto: { id: string; nome: string; marca: string | null } | null
    deposito: { nome: string } | null
  }[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Estoque</h2>
          <Dica texto="Quantidade atual de cada produto por depósito. Atualizado automaticamente após vendas, compras e movimentações manuais." />
        </div>
        <div className="flex gap-2">
          <Link href="/painel/estoque/transferencias"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Entre Depósitos
          </Link>
          <Link href="/painel/estoque/imeis"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Aparelhos (IMEIs)
          </Link>
          <Link href="/painel/estoque/marcas"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Marcas
          </Link>
          <Link href="/painel/estoque/etiquetas"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Etiquetas
          </Link>
          <Link href="/painel/estoque/historico"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Histórico
          </Link>
          <Link href="/painel/estoque/movimentar"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
            + Entrada / Saída
          </Link>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Em Estoque</p>
          <p className="text-3xl font-bold text-green-600 tabular-nums">{emEstoque}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Estoque Baixo (≤3)</p>
          <p className="text-3xl font-bold text-yellow-600 tabular-nums">{estoqueBaixo}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Sem Estoque</p>
          <p className="text-3xl font-bold text-red-600 tabular-nums">{semEstoque}</p>
        </div>
      </div>

      {/* Depósitos como ABAS — o que a estoquista mais troca fica na cara (pedido do Vitor) */}
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: '', nome: 'Todos os depósitos' }, ...depsBotao].map((d) => {
          const ativo = (params.deposito ?? '') === d.id
          const qs = new URLSearchParams({ ...baseParams, ...(d.id ? { deposito: d.id } : {}) })
          if (!d.id) qs.delete('deposito')
          return (
            <Link key={d.id || 'todos'} href={`/painel/estoque${qs.toString() ? '?' + qs.toString() : ''}`}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                ativo ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              {d.nome}
            </Link>
          )
        })}
      </div>

      {/* Busca + categoria */}
      <div className="flex flex-wrap gap-3">
        <BuscaEstoque />
        <form method="GET" className="flex gap-3">
          {params.busca && <input type="hidden" name="busca" value={params.busca} />}
          {params.deposito && <input type="hidden" name="deposito" value={params.deposito} />}
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
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
            Filtrar
          </button>
          {(params.categoria || params.busca) && (
            <Link href={`/painel/estoque${params.deposito ? '?deposito=' + params.deposito : ''}`}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">Limpar</Link>
          )}
        </form>
        <span className="ml-auto self-center text-sm text-gray-400">{total} registro{total === 1 ? '' : 's'}</span>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Marca</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Depósito</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <Link href={qtdSort.href} className="inline-flex items-center gap-1 text-blue-600 hover:text-gray-800 transition">Quantidade <span className="text-gray-400">{qtdSort.arrow}</span></Link>
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum registro de estoque.{' '}
                  <Link href="/painel/estoque/movimentar" className="text-blue-500 hover:underline">Registrar entrada</Link>.
                </td>
              </tr>
            ) : (
              linhas.map((e) => {
                const qtd = e.quantidade
                const prodId = e.produto?.id
                return (
                  <tr key={e.id} className="hover:bg-blue-50/60 transition">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{e.produto?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{e.produto?.marca ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{e.deposito?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 tabular-nums">{qtd}</td>
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
        <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} params={baseParams} basePath="/painel/estoque" />
      </div>
    </div>
  )
}
