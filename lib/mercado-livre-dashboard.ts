import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { diaSP } from '@/lib/utils'
import { DEPOSITO_PETROPOLIS_LOJA, buscarDetalhesEmLote } from '@/lib/mercado-livre'

async function contarTolerante(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count, error } = await query
  return error ? 0 : (count ?? 0)
}

export type VisaoGeralML = {
  anunciosImportados: number
  anunciosSimplesAtivos: number
  anunciosCatalogoAtivos: number
  perguntasNaoRespondidas: number
  mensagensNaoLidas: number
}

export async function buscarVisaoGeral(conexaoId: string): Promise<VisaoGeralML> {
  const supabase = await createServiceClient()
  const [importados, catalogo, perguntas, mensagens] = await Promise.all([
    contarTolerante(supabase.from('integracoes_mercado_livre_anuncios').select('*', { count: 'exact', head: true }).eq('conexao_id', conexaoId)),
    contarTolerante(supabase.from('integracoes_mercado_livre_anuncios').select('*', { count: 'exact', head: true }).eq('conexao_id', conexaoId).eq('is_catalogo', true)),
    contarTolerante(supabase.from('integracoes_mercado_livre_perguntas').select('*', { count: 'exact', head: true }).eq('conexao_id', conexaoId).eq('respondida', false)),
    contarTolerante(supabase.from('integracoes_mercado_livre_mensagens').select('*', { count: 'exact', head: true }).eq('conexao_id', conexaoId).eq('lida', false)),
  ])
  return {
    anunciosImportados: importados,
    anunciosSimplesAtivos: importados - catalogo,
    anunciosCatalogoAtivos: catalogo,
    perguntasNaoRespondidas: perguntas,
    mensagensNaoLidas: mensagens,
  }
}

export type AnuncioSemEstoque = { titulo: string; codigoProduto: string | null; mlItemId: string }

export async function buscarAnunciosSemEstoque(conexaoId: string): Promise<AnuncioSemEstoque[]> {
  const supabase = await createServiceClient()
  const anuncios = await fetchAll<{ ml_item_id: string; titulo_ml: string; produto_id: string | null }>((de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios')
      .select('ml_item_id, titulo_ml, produto_id')
      .eq('conexao_id', conexaoId)
      .not('produto_id', 'is', null)
      .range(de, ate))
  if (anuncios.length === 0) return []
  const produtoIds = anuncios.map((a) => a.produto_id as string)

  const [estoques, produtos] = await Promise.all([
    fetchAllIn<{ produto_id: string; quantidade: number }>(produtoIds, (chunk, de, ate) =>
      supabase.from('estoque').select('produto_id, quantidade')
        .eq('deposito_id', DEPOSITO_PETROPOLIS_LOJA).in('produto_id', chunk).range(de, ate)),
    fetchAllIn<{ id: string; codigo: string | null }>(produtoIds, (chunk, de, ate) =>
      supabase.from('produtos').select('id, codigo').in('id', chunk).range(de, ate)),
  ])
  const qtdPorProduto = new Map(estoques.map((e) => [e.produto_id, Number(e.quantidade)]))
  const codigoPorProduto = new Map(produtos.map((p) => [p.id, p.codigo]))

  return anuncios
    .filter((a) => (qtdPorProduto.get(a.produto_id as string) ?? 0) <= 0)
    .map((a) => ({
      titulo: a.titulo_ml,
      codigoProduto: codigoPorProduto.get(a.produto_id as string) ?? null,
      mlItemId: a.ml_item_id,
    }))
}

export type PontoFluxoVendas = { dia: string; faturamento: number; quantidade: number }

export async function buscarFluxoVendas(conexaoId: string): Promise<PontoFluxoVendas[]> {
  const supabase = await createServiceClient()
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const vendas = await fetchAll<{ total: number; created_at: string }>((de, ate) =>
    supabase.from('vendas').select('total, created_at')
      .eq('ml_conexao_id', conexaoId).gte('created_at', desde).range(de, ate))

  const porDia = new Map<string, { faturamento: number; quantidade: number }>()
  for (const v of vendas) {
    const dia = diaSP(v.created_at)
    const atual = porDia.get(dia) ?? { faturamento: 0, quantidade: 0 }
    atual.faturamento += Number(v.total) || 0
    atual.quantidade += 1
    porDia.set(dia, atual)
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => ({ dia, ...v }))
}

export type AnuncioMaisVendido = { titulo: string; mlItemId: string; quantidadeVendida: number }

export async function buscarMaisVendidos(conexaoId: string): Promise<AnuncioMaisVendido[]> {
  const supabase = await createServiceClient()
  const vendas = await fetchAll<{ id: string }>((de, ate) =>
    supabase.from('vendas').select('id').eq('ml_conexao_id', conexaoId).range(de, ate))
  if (vendas.length === 0) return []
  const vendaIds = vendas.map((v) => v.id)

  const itens = await fetchAllIn<{ produto_id: string | null; quantidade: number }>(vendaIds, (chunk, de, ate) =>
    supabase.from('itens_venda').select('produto_id, quantidade').in('venda_id', chunk).range(de, ate))

  const somaPorProduto = new Map<string, number>()
  for (const i of itens) {
    if (!i.produto_id) continue
    somaPorProduto.set(i.produto_id, (somaPorProduto.get(i.produto_id) ?? 0) + Number(i.quantidade))
  }
  const produtoIds = [...somaPorProduto.keys()]
  if (produtoIds.length === 0) return []

  // Filtra por conexao_id também: o mesmo produto pode estar anunciado em
  // mais de uma conta agora — sem isso o título mostrado podia vir do
  // anúncio errado.
  const anuncios = await fetchAllIn<{ ml_item_id: string; titulo_ml: string; produto_id: string | null }>(produtoIds, (chunk, de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios')
      .select('ml_item_id, titulo_ml, produto_id').eq('conexao_id', conexaoId).in('produto_id', chunk).range(de, ate))

  return anuncios
    .map((a) => ({
      titulo: a.titulo_ml,
      mlItemId: a.ml_item_id,
      quantidadeVendida: somaPorProduto.get(a.produto_id as string) ?? 0,
    }))
    .sort((a, b) => b.quantidadeVendida - a.quantidadeVendida)
    .slice(0, 10)
}

export type AnuncioAguardandoAjuste = { titulo: string; mlItemId: string; subStatus: string }

// Consulta ao vivo na API, em lote (buscarDetalhesEmLote — até 20 por
// chamada, ver lib/mercado-livre.ts).
export async function buscarAnunciosAguardandoAjuste(conexaoId: string): Promise<AnuncioAguardandoAjuste[]> {
  const supabase = await createServiceClient()
  const anuncios = await fetchAll<{ ml_item_id: string }>((de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios').select('ml_item_id').eq('conexao_id', conexaoId).range(de, ate))
  if (anuncios.length === 0) return []

  let detalhes: Awaited<ReturnType<typeof buscarDetalhesEmLote>> = []
  try {
    detalhes = await buscarDetalhesEmLote(conexaoId, anuncios.map((a) => a.ml_item_id))
  } catch (e) {
    console.error('Falha ao consultar status dos anúncios no Mercado Livre:', e)
    return []
  }

  return detalhes.flatMap((item) => {
    if (item.status !== 'under_review') return []
    const subStatus = item.sub_status.find((s) => s === 'warning' || s === 'waiting_for_patch')
    return subStatus ? [{ titulo: item.title, mlItemId: item.id, subStatus }] : []
  })
}
