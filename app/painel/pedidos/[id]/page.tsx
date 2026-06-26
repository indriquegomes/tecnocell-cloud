import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PedidoDetalheClient } from './PedidoDetalheClient'

export default async function PedidoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServiceClient()

  const [{ data: pedido }, { data: itens }, { data: produtos }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, numero, tipo, status, total, data_validade, observacoes, created_at, pessoas(nome)')
      .eq('id', id)
      .single(),
    supabase
      .from('itens_pedido')
      .select('id, produto_id, quantidade, preco_unitario, total_item, produtos(id, nome, preco)')
      .eq('pedido_id', id)
      .order('created_at'),
    supabase.from('produtos').select('id, nome, preco').eq('ativo', true).order('nome'),
  ])

  if (!pedido) notFound()

  return (
    <div className="space-y-6">
      <Link href="/painel/pedidos" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Pedidos e Orçamentos
      </Link>

      <PedidoDetalheClient
        pedido={{
          ...pedido,
          numero: pedido.numero ?? null,
          pessoas: (pedido.pessoas as unknown as { nome: string } | null),
        }}
        itensIniciais={(itens ?? []) as unknown as {
          id: string; produto_id: string; quantidade: number
          preco_unitario: number; total_item: number
          produtos: { id: string; nome: string; preco: number } | null
        }[]}
        produtos={(produtos ?? []).map((p) => ({ id: p.id, nome: p.nome, preco: p.preco ?? 0 }))}
      />
    </div>
  )
}
