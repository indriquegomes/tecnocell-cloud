import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { IconPackage } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BuscaLista } from '@/components/BuscaLista'
import { Paginacao } from '@/components/Paginacao'

const POR_PAGINA = 30

type ProdutoLinha = {
  id: string
  nome: string
  preco: number | null
  estoque: { quantidade: number | null }[] | null
  categorias: { nome: string } | null
}

export default async function IntegracoesProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pagina?: string }>
}) {
  const { busca, pagina: paginaStr } = await searchParams
  const pagina = Math.max(1, Number(paginaStr) || 1)
  const supabase = await createServiceClient()

  let q = supabase
    .from('produtos')
    .select('id, nome, preco, estoque(quantidade), categorias(nome)', { count: 'exact' })
    .eq('ativo', true)
    .order('nome')

  const termo = busca?.trim()
  if (termo) {
    // Mesmo jeito de tirar acento usado em app/painel/tabelas-preco/actions.ts
    // (buscarProdutosParaTabela) — charCodeAt em vez de regex com unicode
    // embutido, pra não arriscar corromper o arquivo (projeto já teve
    // problema de encoding antes, ver CLAUDE.md).
    const semAcento = termo.normalize('NFD').split('')
      .filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 })
      .join('').toLowerCase()
    q = q.ilike('busca_norm', `%${semAcento}%`)
  }

  const de = (pagina - 1) * POR_PAGINA
  const { data, count } = await q.range(de, de + POR_PAGINA - 1)
  const produtos = (data ?? []) as unknown as ProdutoLinha[]
  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Meus Produtos</h2>
        <Dica texto="Catálogo do TecnoCell, pronto pra anunciar quando alguma integração for conectada de verdade. Nenhum produto está integrado ainda." />
      </div>

      <BuscaLista basePath="/painel/integracoes/produtos" placeholder="Buscar produto..." />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Categoria</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Venda</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estoque</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Integrado com</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {produtos.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum produto encontrado.</td></tr>
            ) : produtos.map((p) => {
              const estoqueTotal = (p.estoque ?? []).reduce((soma, e) => soma + (e.quantidade ?? 0), 0)
              return (
                <tr key={p.id} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.categorias?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{formatBRL(p.preco ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">{estoqueTotal}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Não integrado</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Paginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          total={total}
          params={termo ? { busca: termo } : {}}
          basePath="/painel/integracoes/produtos"
        />
      </div>
    </div>
  )
}
