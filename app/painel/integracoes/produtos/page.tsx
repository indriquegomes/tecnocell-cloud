import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { IconPackage } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BuscaLista } from '@/components/BuscaLista'
import { Paginacao } from '@/components/Paginacao'
import { listarConexoes } from '@/lib/mercado-livre'
import { PublicarMLBotao } from './PublicarMLBotao'

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
  searchParams: Promise<{ busca?: string; pagina?: string; erro?: string }>
}) {
  const { busca, pagina: paginaStr, erro } = await searchParams
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
  const [{ data, count }, conexoes] = await Promise.all([
    q.range(de, de + POR_PAGINA - 1),
    listarConexoes(),
  ])
  const produtos = (data ?? []) as unknown as ProdutoLinha[]
  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  const produtoIds = produtos.map((p) => p.id)
  const [{ data: anunciosData, error: erroAnuncios }, { data: rascunhosData, error: erroRascunhos }] = produtoIds.length
    ? await Promise.all([
        supabase
          .from('integracoes_mercado_livre_anuncios')
          .select('produto_id, conexao:integracoes_mercado_livre(nome_loja, ml_nickname, ml_user_id)')
          .in('produto_id', produtoIds),
        supabase
          .from('rascunhos_anuncio_ml')
          .select('id, produto_id, conexao_id')
          .in('produto_id', produtoIds)
          .neq('status', 'publicado'),
      ])
    : [{ data: [] as unknown[], error: null }, { data: [] as unknown[], error: null }]
  // Uma falha aqui não pode virar silenciosamente "não integrado" — senão o
  // botão "Publicar no Mercado Livre" reaparece pra um produto que já TEM
  // anúncio, e um clique cria um segundo anúncio real por engano.
  if (erroAnuncios) console.error('Falha ao buscar status de integração ML em Meus Produtos:', erroAnuncios.message)
  if (erroRascunhos) console.error('Falha ao buscar rascunhos ML em Meus Produtos:', erroRascunhos.message)
  const statusIndisponivel = !!erroAnuncios
  const anuncioPorProduto = new Map(
    (anunciosData ?? []).map((a) => {
      const linha = a as unknown as { produto_id: string; conexao: { nome_loja: string | null; ml_nickname: string | null; ml_user_id: string } | null }
      return [linha.produto_id, linha.conexao?.nome_loja ?? linha.conexao?.ml_nickname ?? linha.conexao?.ml_user_id ?? 'Mercado Livre']
    })
  )
  const rascunhoPorProduto = new Map(
    (rascunhosData ?? []).map((r) => {
      const linha = r as unknown as { id: string; produto_id: string; conexao_id: string }
      return [linha.produto_id, linha]
    })
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Meus Produtos</h2>
        <Dica texto="Catálogo do TecnoCell. Escolha um produto pra publicar como anúncio novo no Mercado Livre." />
      </div>

      {erro && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{erro}</p>}

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
              const integradoCom = anuncioPorProduto.get(p.id)
              const rascunho = rascunhoPorProduto.get(p.id)
              return (
                <tr key={p.id} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.categorias?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{formatBRL(p.preco ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">{estoqueTotal}</td>
                  <td className="px-4 py-3 text-center">
                    {integradoCom ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">{integradoCom}</span>
                    ) : rascunho ? (
                      <a href={`/painel/integracoes/lojas/mercado-livre/${rascunho.conexao_id}/anuncios/rascunho/${rascunho.id}`}
                        className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200">
                        Continuar rascunho
                      </a>
                    ) : statusIndisponivel ? (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-400" title="Não deu pra confirmar o status de integração agora">
                        Status indisponível
                      </span>
                    ) : conexoes.length > 0 ? (
                      <PublicarMLBotao produtoId={p.id} conexoes={conexoes.map((c) => ({ id: c.id, nome: c.nome_loja ?? c.ml_nickname ?? c.ml_user_id }))} />
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Não integrado</span>
                    )}
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
