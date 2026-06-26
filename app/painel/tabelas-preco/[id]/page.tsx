import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { TabelaDetalheClient } from './TabelaDetalheClient'

export default async function TabelaPrecoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServiceClient()

  const [{ data: tabela }, { data: itens }, { data: produtos }] = await Promise.all([
    supabase.from('tabelas_preco').select('id, nome, descricao, ativa').eq('id', id).single(),
    supabase
      .from('itens_tabela_preco')
      .select('id, produto_id, preco, produtos(id, nome, preco)')
      .eq('tabela_id', id)
      .order('created_at'),
    supabase.from('produtos').select('id, nome, preco').order('nome'),
  ])

  if (!tabela) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/tabelas-preco" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <TabelaDetalheClient
          tabela={tabela}
          itens={((itens ?? []) as unknown as {
            id: string
            produto_id: string
            preco: number
            produtos: { id: string; nome: string; preco: number } | null
          }[])}
          produtos={(produtos ?? []).map((p) => ({ id: p.id, nome: p.nome, preco: p.preco ?? 0 }))}
        />
      </div>
    </div>
  )
}
