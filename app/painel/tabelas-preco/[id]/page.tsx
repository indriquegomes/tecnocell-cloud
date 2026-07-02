import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { TabelaDetalheClient } from './TabelaDetalheClient'
import { atualizarVigencia } from '../actions'

export default async function TabelaPrecoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServiceClient()

  const [{ data: tabela }, { data: itens }, { data: produtos }] = await Promise.all([
    supabase.from('tabelas_preco').select('id, nome, descricao, ativa, data_inicio, data_fim').eq('id', id).single(),
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
      <Link href="/painel/tabelas-preco" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Tabelas de Preço
      </Link>

      {/* Vigência */}
      <form action={atualizarVigencia.bind(null, id)} className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 self-center">Vigência</span>
        <div>
          <label className="mb-1 block text-[11px] text-gray-500">Válida de</label>
          <input name="data_inicio" type="date" defaultValue={(tabela as { data_inicio: string | null }).data_inicio ?? ''} className="field py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-gray-500">até</label>
          <input name="data_fim" type="date" defaultValue={(tabela as { data_fim: string | null }).data_fim ?? ''} className="field py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Salvar vigência</button>
        <span className="ml-auto self-center text-[11px] text-gray-400">Vazio = sempre válida. Fora do período, o PDV não oferece a tabela.</span>
      </form>

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
  )
}
