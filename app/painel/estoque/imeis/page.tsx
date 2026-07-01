import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

type Status = 'em_estoque' | 'vendido' | 'devolvido' | 'defeito'

const ST: Record<string, { label: string; cls: string }> = {
  em_estoque: { label: 'Em estoque', cls: 'text-green-700 bg-green-50 border-green-200' },
  vendido:    { label: 'Vendido',    cls: 'text-gray-600 bg-gray-100 border-gray-200' },
  devolvido:  { label: 'Devolvido',  cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  defeito:    { label: 'Defeito',    cls: 'text-red-700 bg-red-50 border-red-200' },
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'

export default async function ImeisPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; deposito?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const { data: depositos } = await supabase.from('depositos').select('id, nome').order('nome')

  let query = supabase
    .from('numeros_serie')
    .select('id, serie, status, produto_id, deposito_id, venda_id, created_at, produtos(nome, codigo), depositos(nome)')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (params.status) query = query.eq('status', params.status)
  if (params.deposito) query = query.eq('deposito_id', params.deposito)

  const { data: raw } = await query

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let linhas = (raw ?? []) as any[]

  if (params.q?.trim()) {
    const t = params.q.toLowerCase().trim()
    linhas = linhas.filter((l) =>
      (l.serie ?? '').toLowerCase().includes(t) ||
      (l.produtos?.nome ?? '').toLowerCase().includes(t)
    )
  }

  // Números das vendas (venda_id é text; join manual)
  const vendaIds = [...new Set(linhas.map((l) => l.venda_id).filter(Boolean))] as string[]
  const { data: vendas } = vendaIds.length
    ? await supabase.from('vendas').select('id, numero').in('id', vendaIds)
    : { data: [] as { id: string; numero: number | null }[] }
  const vendaNum = Object.fromEntries((vendas ?? []).map((v) => [v.id, v.numero]))

  // Contagem exata por status (head:true) — não depende do limit da lista
  const contar = async (s: Status) => {
    let q = supabase.from('numeros_serie').select('*', { count: 'exact', head: true }).eq('status', s)
    if (params.deposito) q = q.eq('deposito_id', params.deposito)
    const { count } = await q
    return count ?? 0
  }
  const [emEstoque, vendido, defeito] = await Promise.all([contar('em_estoque'), contar('vendido'), contar('defeito')])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/estoque" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Aparelhos (IMEIs)</h2>
        <Dica texto="Cada aparelho serializado é rastreado por número de série. Busque um IMEI para saber se está em estoque ou em qual venda saiu (garantia, troca)." lado="baixo" />
        <span className="ml-auto text-sm text-gray-400">{linhas.length} unidades</span>
      </div>

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Em estoque</p>
          <p className="text-3xl font-bold text-green-600">{emEstoque}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Vendidos</p>
          <p className="text-3xl font-bold text-gray-700">{vendido}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Com defeito</p>
          <p className="text-3xl font-bold text-red-600">{defeito}</p>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Buscar IMEI ou produto..."
          className="w-64 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select name="status" defaultValue={params.status ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os status</option>
          <option value="em_estoque">Em estoque</option>
          <option value="vendido">Vendido</option>
          <option value="devolvido">Devolvido</option>
          <option value="defeito">Defeito</option>
        </select>
        <select name="deposito" defaultValue={params.deposito ?? ''}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os depósitos</option>
          {(depositos ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition">
          Filtrar
        </button>
        <Link href="/painel/estoque/imeis" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
          Limpar
        </Link>
      </form>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">IMEI / Série</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Depósito</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Entrada</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Venda</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum aparelho serializado.{' '}
                  <Link href="/painel/estoque/historico" className="text-blue-500 hover:underline">Registrar entrada com IMEI</Link>.
                </td>
              </tr>
            ) : (
              linhas.map((l) => {
                const st = ST[l.status] ?? { label: l.status, cls: 'text-gray-600 bg-gray-100 border-gray-200' }
                const num = l.venda_id ? vendaNum[l.venda_id] : null
                return (
                  <tr key={l.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-sm font-mono text-gray-800">{l.serie}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-700">
                      {l.produtos?.nome ?? '—'}
                      {l.produtos?.codigo && <span className="text-gray-400 font-normal"> · {l.produtos.codigo}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{l.depositos?.nome ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(l.created_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {num != null ? `Venda #${num}` : l.venda_id ? 'Venda' : '—'}
                    </td>
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
