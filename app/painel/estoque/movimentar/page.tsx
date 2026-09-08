import { createServiceClient } from '@/lib/supabase/server'
import { NovaMovimentacaoForm } from '../historico/NovaMovimentacaoForm'
import Link from 'next/link'

export default async function MovimentarEstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ produto_id?: string; deposito_id?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const agoraBr = new Date().toLocaleString('sv', { timeZone: 'America/Sao_Paulo' })
  const dataHoje = agoraBr.slice(0, 10)
  const horaAgora = agoraBr.slice(11, 16)

  const [depositosRes, produtosRes, seriesRes, produtoPreRes] = await Promise.all([
    supabase.from('depositos').select('id, nome').order('nome'),
    supabase.from('produtos').select('id, nome, codigo, controla_serie').eq('ativo', true).order('nome').limit(500),
    supabase.from('numeros_serie').select('produto_id, deposito_id, serie').eq('status', 'em_estoque').order('serie'),
    params.produto_id
      ? supabase.from('produtos').select('id, nome').eq('id', params.produto_id).maybeSingle()
      : Promise.resolve({ data: null as { id: string; nome: string } | null }),
  ])

  // IMEIs em estoque por produto/depósito (pra baixa de serializado na saída)
  const seriesPorProduto: Record<string, Record<string, string[]>> = {}
  for (const s of (seriesRes.data ?? []) as { produto_id: string; deposito_id: string; serie: string }[]) {
    if (!s.produto_id || !s.deposito_id) continue
    ;(seriesPorProduto[s.produto_id] ??= {})[s.deposito_id] ??= []
    seriesPorProduto[s.produto_id][s.deposito_id].push(s.serie)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Movimentar Estoque</h2>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/painel/estoque" className="hover:text-gray-700 transition">Estoque</Link>
          <span>›</span>
          <span className="text-gray-800 font-medium">Movimentações</span>
        </div>
        <Link href="/painel/estoque"
          className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition">
          Voltar
        </Link>
      </div>

      <NovaMovimentacaoForm
        abertoPadrao
        depositos={(depositosRes.data ?? []) as { id: string; nome: string }[]}
        produtos={(produtosRes.data ?? []) as { id: string; nome: string; codigo: string | null; controla_serie: boolean | null }[]}
        seriesPorProduto={seriesPorProduto}
        dataHoje={dataHoje}
        horaAgora={horaAgora}
        depositoInicial={params.deposito_id ?? ''}
        produtoInicial={(produtoPreRes.data as { nome: string } | null)?.nome ?? ''}
      />
    </div>
  )
}
