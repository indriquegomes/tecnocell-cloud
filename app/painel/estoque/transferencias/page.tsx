import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { TransferenciaForm } from './TransferenciaForm'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const [{ data: depositos }, { data: produtos }, { data: seriesEmEstoque }, { data: movs }] = await Promise.all([
    supabase.from('depositos').select('id, nome').order('nome'),
    supabase.from('produtos').select('id, nome, codigo, controla_serie').eq('ativo', true).order('nome').limit(500),
    supabase.from('numeros_serie').select('produto_id, deposito_id, serie').eq('status', 'em_estoque').order('serie'),
    supabase.from('movimentacoes_estoque')
      .select('id, produto_id, quantidade, observacao, created_at')
      .eq('operacao', 'saida').like('observacao', 'Transferência p/%')
      .order('created_at', { ascending: false }).limit(30),
  ])

  const seriesPorProduto: Record<string, Record<string, string[]>> = {}
  for (const s of (seriesEmEstoque ?? []) as { produto_id: string; deposito_id: string; serie: string }[]) {
    if (!s.produto_id || !s.deposito_id) continue
    ;(seriesPorProduto[s.produto_id] ??= {})[s.deposito_id] ??= []
    seriesPorProduto[s.produto_id][s.deposito_id].push(s.serie)
  }

  const prodIds = [...new Set((movs ?? []).map((m) => m.produto_id))]
  const { data: prods } = prodIds.length
    ? await supabase.from('produtos').select('id, nome').in('id', prodIds)
    : { data: [] as { id: string; nome: string }[] }
  const nomeProd = Object.fromEntries((prods ?? []).map((p) => [p.id, p.nome]))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Entre Depósitos</h2>
        <Dica texto="Transfere estoque de uma loja/depósito para outro. Para aparelhos serializados, escolha os IMEIs — eles trocam de depósito junto." lado="baixo" />
      </div>

      {params.ok && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Transferência registrada com sucesso.
        </div>
      )}
      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.erro === 'produto-nao-encontrado' ? 'Produto não encontrado. Selecione um da lista.' : params.erro}
        </div>
      )}

      <TransferenciaForm
        depositos={depositos ?? []}
        produtos={produtos ?? []}
        seriesPorProduto={seriesPorProduto}
      />

      {/* Últimas transferências */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">Últimas transferências</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Qtd</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Movimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(movs ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma transferência ainda.</td></tr>
              ) : (
                (movs ?? []).map((m) => (
                  <tr key={m.id} className="hover:bg-blue-50/60 transition">
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{nomeProd[m.produto_id] ?? m.produto_id}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-900">{m.quantidade}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{m.observacao}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
