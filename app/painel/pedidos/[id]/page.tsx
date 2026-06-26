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

  const [{ data: pedido }, { data: itens }, { data: produtos }, { data: depositos }, { data: formas }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id, numero, tipo, status, total, data_validade, observacoes, created_at, pessoa_id, deposito_id, tabela_preco_id, forma_pagamento_id, vendedor_nome, origem')
      .eq('id', id)
      .single(),
    supabase
      .from('itens_pedido')
      .select('id, produto_id, quantidade, preco_unitario, total_item')
      .eq('pedido_id', id),
    supabase.from('produtos').select('id, nome, preco').eq('ativo', true).order('nome'),
    supabase.from('depositos').select('id, nome').order('nome'),
    supabase.from('formas_pagamento').select('id, nome').eq('ativo', true).order('nome'),
  ])

  if (!pedido) notFound()

  // Nomes de cliente
  const pessoaMap: Record<string, string> = {}
  if (pedido.pessoa_id) {
    const { data: p } = await supabase.from('pessoas').select('id, nome').eq('id', pedido.pessoa_id).maybeSingle()
    if (p) pessoaMap[p.id] = p.nome
  }

  // Tabela de preços — mapa produto_id → preco
  let precoTabela: Record<string, number> = {}
  if (pedido.tabela_preco_id) {
    const { data: itensTp } = await supabase
      .from('itens_tabela_preco')
      .select('produto_id, preco')
      .eq('tabela_id', pedido.tabela_preco_id)
    precoTabela = Object.fromEntries((itensTp ?? []).map(i => [i.produto_id, i.preco]))
  }

  const depositoMap = Object.fromEntries((depositos ?? []).map(d => [d.id, d.nome]))
  const formaMap = Object.fromEntries((formas ?? []).map(f => [f.id, f.nome]))

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
          numero:               pedido.numero ?? null,
          pessoa_nome:          pedido.pessoa_id ? (pessoaMap[pedido.pessoa_id] ?? null) : null,
          deposito_id:          pedido.deposito_id ?? null,
          deposito_nome:        pedido.deposito_id ? (depositoMap[pedido.deposito_id] ?? null) : null,
          forma_pagamento_id:   pedido.forma_pagamento_id ?? null,
          forma_pagamento_nome: pedido.forma_pagamento_id ? (formaMap[pedido.forma_pagamento_id] ?? null) : null,
        }}
        itensIniciais={(itens ?? []).map(i => {
          const prod = (produtos ?? []).find(p => p.id === i.produto_id) ?? null
          return { ...i, produtos: prod }
        }) as {
          id: string; produto_id: string; quantidade: number
          preco_unitario: number; total_item: number
          produtos: { id: string; nome: string; preco: number } | null
        }[]}
        produtos={(produtos ?? []).map(p => ({ id: p.id, nome: p.nome, preco: p.preco ?? 0 }))}
        precoTabela={precoTabela}
        depositos={(depositos ?? []) as { id: string; nome: string }[]}
        formas={(formas ?? []) as { id: string; nome: string }[]}
      />
    </div>
  )
}
