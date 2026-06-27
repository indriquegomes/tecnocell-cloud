import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'

const OPERACAO: Record<string, { label: string; cls: string }> = {
  entrada: { label: 'Entrada', cls: 'text-green-700 bg-green-50 border-green-200' },
  saida:   { label: 'Saída',   cls: 'text-red-700 bg-red-50 border-red-200' },
  ajuste:  { label: 'Ajuste',  cls: 'text-blue-700 bg-blue-50 border-blue-200' },
}

export default async function HistoricoEstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ operacao?: string; deposito?: string; busca?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  let query = supabase
    .from('movimentacoes_estoque')
    .select('id, produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  if (params.operacao) query = query.eq('operacao', params.operacao)
  if (params.deposito) query = query.eq('deposito_id', params.deposito)

  const [{ data: raw }, { data: depositos }] = await Promise.all([
    query,
    supabase.from('depositos').select('id, nome').order('nome'),
  ])

  const rows = raw ?? []

  // Buscar nomes de produtos e depósitos em batch
  const prodIds = [...new Set(rows.map((r) => r.produto_id).filter(Boolean))]
  const depIds  = [...new Set(rows.map((r) => r.deposito_id).filter(Boolean))]

  const [{ data: prods }, { data: deps }] = await Promise.all([
    prodIds.length
      ? supabase.from('produtos').select('id, nome, codigo').in('id', prodIds)
      : Promise.resolve({ data: [] as { id: string; nome: string; codigo: string | null }[] }),
    depIds.length
      ? supabase.from('depositos').select('id, nome').in('id', depIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])

  const prodMap = Object.fromEntries((prods ?? []).map((p) => [p.id, p]))
  const depMap  = Object.fromEntries((deps  ?? []).map((d) => [d.id, d]))

  // Filtro JS por nome/código do produto
  let movs = rows
  if (params.busca) {
    const t = params.busca.toLowerCase()
    movs = rows.filter((r) => {
      const p = prodMap[r.produto_id]
      return (
        (p?.nome ?? '').toLowerCase().includes(t) ||
        (p?.codigo ?? '').toLowerCase().includes(t)
      )
    })
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Histórico de Estoque</h2>
        <span className="ml-auto text-sm text-gray-400">{movs.length} registros</span>
      </div>

      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="busca"
          defaultValue={params.busca}
          placeholder="Buscar produto..."
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="operacao"
          defaultValue={params.operacao ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas as operações</option>
          <option value="entrada">Entrada</option>
          <option value="saida">Saída</option>
          <option value="ajuste">Ajuste</option>
        </select>
        <select
          name="deposito"
          defaultValue={params.deposito ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os depósitos</option>
          {(depositos ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.nome}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Filtrar
        </button>
        <Link href="/painel/estoque/historico" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
          Limpar
        </Link>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data/Hora</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Depósito</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Operação</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Qtd</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Antes → Depois</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Observação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {movs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhuma movimentação registrada ainda.{' '}
                  <Link href="/painel/estoque/movimentar" className="text-blue-500 hover:underline">
                    Registrar entrada
                  </Link>.
                </td>
              </tr>
            ) : (
              movs.map((m) => {
                const prod = prodMap[m.produto_id]
                const dep  = depMap[m.deposito_id]
                const op   = OPERACAO[m.operacao] ?? { label: m.operacao, cls: 'text-gray-700 bg-gray-50 border-gray-200' }
                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {fmtDate(m.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{prod?.nome ?? m.produto_id}</p>
                      {prod?.codigo && <p className="text-xs text-gray-400">#{prod.codigo}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{dep?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${op.cls}`}>
                        {op.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-gray-900">{m.quantidade}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-500">
                      {m.qtd_anterior} → {m.qtd_nova}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{m.observacao || '—'}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
