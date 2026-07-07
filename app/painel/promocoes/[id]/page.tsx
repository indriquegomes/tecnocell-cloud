import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PromoDetalheClient } from './PromoDetalheClient'

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

  // catálogo pra o painel de adicionar em lote (busca + selecionar todos)
  const catalogo = await fetchAll<{ id: string; nome: string; codigo: string | null; marca: string | null; preco: number | null; preco_custo: number | null }>(
    (from, to) => supabase.from('produtos').select('id, nome, codigo, marca, preco, preco_custo').eq('ativo', true).order('nome').order('id').range(from, to),
  )
  const jaNaPromo = new Set((itensRaw ?? []).map(i => i.produto_id))

  // faixas de quantidade (tipo progressivo)
  const { data: faixas } = await supabase
    .from('faixas_promocao')
    .select('id, quantidade_minima, preco')
    .eq('promocao_id', id)
    .order('quantidade_minima')

  return (
    <div className="space-y-4">
      <Link href="/painel/promocoes" className="text-sm text-blue-600 hover:text-blue-800">
        ← Voltar para Promoções
      </Link>
      <PromoDetalheClient
        promocao={promo}
        itens={itens}
        catalogo={catalogo.map(p => ({ id: p.id, nome: p.nome, codigo: p.codigo, marca: p.marca, preco: p.preco ?? 0, preco_custo: p.preco_custo ?? 0 }))}
        jaNaPromo={[...jaNaPromo]}
        faixas={(faixas ?? []) as { id: string; quantidade_minima: number; preco: number }[]}
      />
    </div>
  )
}
