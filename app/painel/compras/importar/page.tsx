import Link from 'next/link'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { depositosDaLojaAtiva } from '@/lib/lojas-usuario'
import { hojeSP } from '@/lib/utils'
import { ImportarClient } from './ImportarClient'

export default async function ImportarNotaPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()
  // só fornecedores, filtrado no servidor
  const { data: fornecedoresRaw } = await supabase.from('pessoas').select('id, nome').in('tipo', ['fornecedor', 'ambos']).order('nome')
  // Número automático pela contagem das notas anteriores — editável.
  const { count } = await supabase.from('notas_entrada').select('id', { count: 'exact', head: true })
  const proximoNumero = String((count ?? 0) + 1)
  const [{ data: depositos }, { data: lojas }, produtos] = await Promise.all([
    supabase.from('depositos').select('id, nome, loja_id').order('nome'),
    supabase.from('lojas').select('id, nome'),
    fetchAll<{ id: string; nome: string }>((from, to) =>
      supabase.from('produtos').select('id, nome').eq('ativo', true).order('nome').range(from, to)),
  ])
  // deposito padrão: o da loja ativa de quem está logado
  const depositosAtiva = await depositosDaLojaAtiva().catch(() => [] as string[])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/compras" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">Importar Nota por Foto</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Anexe as fotos da nota que chegou. O app lê os itens e monta a nota pendente — confira e clique em criar.
          </p>
        </div>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      <ImportarClient
        fornecedores={(fornecedoresRaw ?? []) as { id: string; nome: string }[]}
        depositos={(depositos ?? []) as { id: string; nome: string; loja_id: string | null }[]}
        lojas={(lojas ?? []) as { id: string; nome: string }[]}
        produtos={produtos}
        proximoNumero={proximoNumero}
        hoje={hojeSP()}
        depositoPadrao={depositosAtiva[0] ?? null}
      />
    </div>
  )
}
