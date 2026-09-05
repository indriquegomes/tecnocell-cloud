import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PromoDetalheClient } from './PromoDetalheClient'
import { TabelasPromo } from './TabelasPromo'

export default async function PromoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServiceClient()

  const { data: promo } = await supabase
    .from('promocoes')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!promo) notFound()

  const { data: itensRaw } = await supabase
    .from('itens_promocao')
    .select('id, produto_id, preco_promocional, quantidade_x, quantidade_y')
    .eq('promocao_id', id)

  // Busca nomes dos produtos manualmente (sem FK)
  const produtoIds = (itensRaw ?? []).map(i => i.produto_id)
  const { data: produtos } = produtoIds.length > 0
    ? await supabase.from('produtos').select('id, nome, preco').in('id', produtoIds)
    : { data: [] }

  const prodMap = Object.fromEntries((produtos ?? []).map(p => [p.id, p]))

  const itens = (itensRaw ?? []).map(i => ({
    id: i.id,
    produto_id: i.produto_id,
    nome_produto: prodMap[i.produto_id]?.nome ?? i.produto_id,
    preco_padrao: prodMap[i.produto_id]?.preco ?? 0,
    preco_promocional: i.preco_promocional,
    quantidade_x: i.quantidade_x,
    quantidade_y: i.quantidade_y,
  }))

  // catálogo do painel "adicionar em lote" NÃO é mais embutido — o client busca
  // sob demanda (buscarCatalogoPromo).
  const jaNaPromo = new Set((itensRaw ?? []).map(i => i.produto_id))

  // faixas de quantidade (tipo progressivo)
  const { data: faixas } = await supabase
    .from('faixas_promocao')
    .select('id, quantidade_minima, preco')
    .eq('promocao_id', id)
    .order('quantidade_minima')

  // ── Categorias, pra "adicionar categoria inteira" (pedido da Isa: não catar as 327
  //    películas na mão). Conta quantos produtos ATIVOS cada uma tem.
  //    fetchAll: COMPONENTE sozinha tem 2.886 e o PostgREST capa em 1000.
  const [{ data: catsRaw }, todosProdutos] = await Promise.all([
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
    fetchAll<{ id: string; categoria: string | null }>(
      (from, to) => supabase.from('produtos').select('id, categoria').eq('ativo', true).order('id').range(from, to),
    ),
  ])

  const porCategoria: Record<string, string[]> = {}
  for (const p of todosProdutos) {
    if (p.categoria) (porCategoria[p.categoria] ??= []).push(p.id)
  }
  const categorias = (catsRaw ?? [])
    .map((c) => ({ hierarquia: c.hierarquia as string, nome: c.nome as string, total: (porCategoria[c.hierarquia] ?? []).length }))
    .filter((c) => c.total > 0)

  // A promoção é uma FOTO: produto novo na categoria não entra sozinho. Conta quantos
  // ficaram de fora pra tela poder avisar.
  // Tabelas de preço em que a promoção vale (Isa). Tolerante à migration ainda não
  // aplicada: se promocao_tabelas não existe, selecionadas fica vazia (= todas).
  const [{ data: tabelasPreco }, { data: vincTabelas }] = await Promise.all([
    supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).eq('usa_preco_custo', false).order('nome'),
    supabase.from('promocao_tabelas').select('tabela_id').eq('promocao_id', id),
  ])
  const tabelasSelecionadas = (vincTabelas ?? []).map((v) => v.tabela_id as string)

  const categoriaAtual = (promo.categoria as string | null) ?? null
  const faltamNaCategoria = categoriaAtual
    ? (porCategoria[categoriaAtual] ?? []).filter((pid) => !jaNaPromo.has(pid)).length
    : 0
  const nomeCategoriaAtual = categorias.find((c) => c.hierarquia === categoriaAtual)?.nome ?? null

  return (
    <div className="space-y-4">
      <Link href="/painel/promocoes" className="text-sm text-blue-600 hover:text-blue-800">
        ← Voltar para Promoções
      </Link>
      <PromoDetalheClient
        promocao={promo}
        itens={itens}
        jaNaPromo={[...jaNaPromo]}
        faixas={(faixas ?? []) as { id: string; quantidade_minima: number; preco: number }[]}
        categorias={categorias}
        categoriaAtual={categoriaAtual}
        faltamNaCategoria={faltamNaCategoria}
        nomeCategoriaAtual={nomeCategoriaAtual}
      />
      <TabelasPromo
        promocaoId={id}
        tabelas={(tabelasPreco ?? []) as { id: string; nome: string }[]}
        selecionadas={tabelasSelecionadas}
      />
    </div>
  )
}
