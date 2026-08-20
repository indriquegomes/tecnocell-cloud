import { createServiceClient } from '@/lib/supabase/server'
import { NovoPedidoForm } from './NovoPedidoForm'
import Link from 'next/link'

export default async function NovoPedidoPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()

  // cliente é buscado sob demanda no form (buscarClientesPedido) — não embute mais
  const [{ data: depositos }, { data: tabelas }, { data: formas }] = await Promise.all([
    supabase.from('depositos').select('id, nome').order('nome'),
    supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).order('nome'),
    // marketplace (Mercado Livre) fica de fora: faturar um pedido chama
    // finalizar_venda direto com essa forma_pagamento_id (ver actions.ts) — se
    // pudesse escolher aqui, um pedido de balcão viraria venda "paga pelo
    // Mercado Livre" sem ter passado por lá.
    supabase.from('formas_pagamento').select('id, nome').eq('ativo', true).neq('tipo', 'marketplace').order('nome'),
  ])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/pedidos" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Novo Pedido / Orçamento</h2>
      </div>

      <NovoPedidoForm
        depositos={(depositos ?? []) as { id: string; nome: string }[]}
        tabelas={(tabelas ?? []) as { id: string; nome: string }[]}
        formas={(formas ?? []) as { id: string; nome: string }[]}
        erro={erro}
      />
    </div>
  )
}
