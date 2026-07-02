import { createServiceClient } from '@/lib/supabase/server'
import { PessoaForm } from '../PessoaForm'
import Link from 'next/link'

export default async function NovaClientePage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()
  const { data: tabelas } = await supabase.from('tabelas_preco').select('id, nome').eq('ativa', true).order('nome')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/clientes" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Novo Cadastro</h2>
      </div>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
      )}

      <PessoaForm tabelas={tabelas ?? []} />
    </div>
  )
}
